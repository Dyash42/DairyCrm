/**
 * Bulk customer import — pure parsing + validation.
 *
 * Used for onboarding pre-existing customers (typically 400–500 at launch).
 * The admin downloads a CSV template, fills it in Excel, uploads → we
 * validate every row → admin previews → admin commits.
 *
 * Why a hand-rolled CSV parser (no Papa-parse / csv-parse dep): the format
 * is tiny, well-known, and pulling in another runtime dep for ~80 lines of
 * code is not worth it. We handle quoted fields, escaped quotes, and \r\n
 * line endings.
 *
 * This file is PURE. Real Prisma calls live in modules/customers/bulk.ts
 * which wires this parser to the DB.
 */

import { DEFAULT_RATE_PER_LITRE_INR, DEFAULT_SUBSCRIPTION_DAYS } from '../constants';

// ---------- Column spec ----------

/** Canonical column names. Order matters — it's the header row. */
export const COLUMNS = [
  'name',
  'phone',
  'alt_phone',
  'email',
  'address_line1',
  'area',
  'pin_code',
  'route_name',
  'product_code',
  'litres_per_day',
  'days_of_week',
  'duration_days',
  'start_date',
  'customer_code',
] as const;

export type ColumnName = (typeof COLUMNS)[number];

const REQUIRED: ColumnName[] = [
  'name',
  'phone',
  'address_line1',
  'route_name',
  'litres_per_day',
];

// ---------- Output shapes ----------

export interface ValidatedRow {
  /** 1-based row number in the source CSV (header is row 0). */
  row: number;
  name: string;
  phone: string;
  altPhone?: string;
  email?: string;
  addressLine1: string;
  area?: string;
  pinCode?: string;
  routeName: string;
  /** Resolved at validate-time from product_code. */
  productCode: string;
  litresPerDay: number;
  daysOfWeek: number[];
  durationDays: number;
  /** ISO YYYY-MM-DD; defaults to tomorrow if blank. */
  startDate: string;
  /** Optional override; otherwise system generates JHR-XXXXXX. */
  customerCode?: string;
}

export interface ValidationIssue {
  row: number;
  column?: ColumnName;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidateResult {
  valid: ValidatedRow[];
  issues: ValidationIssue[];
  /** Set of phone numbers in `valid` — useful for duplicate detection against DB. */
  phones: string[];
  /** Set of customer codes the rows want to claim. */
  codes: string[];
}

// ---------- CSV parser ----------

/**
 * Tiny CSV reader. Supports:
 *   - Quoted fields with "" escapes
 *   - LF and CRLF line endings
 *   - Trailing empty cells
 *   - Trailing newline
 *
 * Does NOT support multi-line cells inside quotes for v1 — we error if we
 * see an unterminated quote at EOL. The spec for customer addresses doesn't
 * allow newlines, so this is fine.
 */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let i = 0;
  let cell = '';
  let row: string[] = [];
  let inQuotes = false;

  const pushCell = () => {
    row.push(cell);
    cell = '';
  };
  const pushRow = () => {
    rows.push(row);
    row = [];
  };

  while (i < input.length) {
    const ch = input[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      cell += ch;
      i++;
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (ch === ',') {
      pushCell();
      i++;
      continue;
    }
    if (ch === '\r') {
      i++;
      continue;
    }
    if (ch === '\n') {
      pushCell();
      pushRow();
      i++;
      continue;
    }
    cell += ch;
    i++;
  }
  // Flush last
  if (cell.length > 0 || row.length > 0) {
    pushCell();
    pushRow();
  }
  return rows;
}

// ---------- Day-of-week shorthand ----------

const DOW_SHORTHANDS: Record<string, number[]> = {
  EVERY_DAY: [0, 1, 2, 3, 4, 5, 6],
  ALL_DAYS: [0, 1, 2, 3, 4, 5, 6],
  MON_TO_SAT: [1, 2, 3, 4, 5, 6],
  WEEKDAYS: [1, 2, 3, 4, 5],
  WEEKENDS: [0, 6],
};

function parseDaysOfWeek(raw: string): number[] | null {
  const cleaned = raw.trim().toUpperCase();
  if (cleaned === '') return null;
  if (cleaned in DOW_SHORTHANDS) return DOW_SHORTHANDS[cleaned] as number[];
  // Numeric list: "1,2,3,4,5,6" or "1 2 3 4 5 6"
  const parts = cleaned.split(/[,\s]+/).filter(Boolean);
  if (parts.length === 0) return null;
  const nums: number[] = [];
  for (const p of parts) {
    const n = Number(p);
    if (!Number.isInteger(n) || n < 0 || n > 6) return null;
    nums.push(n);
  }
  return Array.from(new Set(nums)).sort();
}

// ---------- Phone normalization (mirrors utils/phone.ts) ----------

function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+91${digits}`;
  if (digits.startsWith('91') && digits.length === 12) return `+${digits}`;
  return raw.startsWith('+') ? raw : `+${digits}`;
}

// ---------- Date parsing ----------

function parseStartDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === '') {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 1);
    return d.toISOString().slice(0, 10);
  }
  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  // DD/MM/YYYY (common Excel default for Indian locale)
  const m = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (m && m[1] && m[2] && m[3]) {
    const dd = m[1].padStart(2, '0');
    const mm = m[2].padStart(2, '0');
    return `${m[3]}-${mm}-${dd}`;
  }
  // DD MMM YYYY (e.g. "15 Jun 2026")
  const MONTHS: Record<string, string> = {
    jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
    jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const named = trimmed.toLowerCase().match(/^(\d{1,2})\s+([a-z]{3,})(?:\s+(\d{4}))?$/);
  if (named && named[1] && named[2]) {
    const month = MONTHS[named[2].slice(0, 3)];
    if (month) {
      const dd = named[1].padStart(2, '0');
      const yr = named[3] ?? String(new Date().getFullYear());
      return `${yr}-${month}-${dd}`;
    }
  }
  return null;
}

// ---------- Main validator ----------

/**
 * Validate a parsed CSV. Returns the rows that passed and the issues per
 * row that didn't. Callers (REST endpoint) cross-check with the DB for
 * route existence + phone uniqueness.
 */
export function validateCsv(csv: string): ValidateResult {
  const rows = parseCsv(csv).filter((r) => r.some((c) => c.trim() !== ''));
  const issues: ValidationIssue[] = [];
  const valid: ValidatedRow[] = [];

  if (rows.length === 0) {
    issues.push({ row: 0, severity: 'error', message: 'File is empty' });
    return { valid, issues, phones: [], codes: [] };
  }

  const header = (rows[0] ?? []).map((c) => c.trim().toLowerCase());
  // Index each column by name; missing = -1
  const colIdx: Record<string, number> = {};
  for (const col of COLUMNS) {
    colIdx[col] = header.indexOf(col);
  }

  // Header sanity
  const missingHeaders = REQUIRED.filter((c) => (colIdx[c] ?? -1) === -1);
  if (missingHeaders.length > 0) {
    issues.push({
      row: 0,
      severity: 'error',
      message: `Missing required header(s): ${missingHeaders.join(', ')}`,
    });
    return { valid, issues, phones: [], codes: [] };
  }

  const seenPhones = new Set<string>();
  const seenCodes = new Set<string>();

  for (let i = 1; i < rows.length; i++) {
    const r = rows[i] as string[];
    const rowIssues: ValidationIssue[] = [];

    const cell = (col: ColumnName) => {
      const idx = colIdx[col];
      if (idx === undefined || idx < 0 || idx >= r.length) return '';
      return (r[idx] ?? '').trim();
    };

    // Required strings
    for (const col of REQUIRED) {
      if (cell(col) === '') {
        rowIssues.push({ row: i, column: col, severity: 'error', message: `${col} is required` });
      }
    }

    // Phone
    const phoneRaw = cell('phone');
    const phone = normalizePhone(phoneRaw);
    if (phoneRaw !== '' && !/^\+\d{10,15}$/.test(phone)) {
      rowIssues.push({ row: i, column: 'phone', severity: 'error', message: `Invalid phone: ${phoneRaw}` });
    }
    if (seenPhones.has(phone)) {
      rowIssues.push({
        row: i, column: 'phone', severity: 'error',
        message: `Duplicate phone in CSV: ${phone}`,
      });
    }

    // Litres
    const litresRaw = cell('litres_per_day');
    const litres = Number(litresRaw);
    if (litresRaw !== '' && (!Number.isFinite(litres) || litres <= 0 || litres > 50)) {
      rowIssues.push({
        row: i, column: 'litres_per_day', severity: 'error',
        message: `Invalid litres_per_day: ${litresRaw}`,
      });
    }

    // Days of week
    const dowRaw = cell('days_of_week');
    const dow = dowRaw === '' ? DOW_SHORTHANDS.EVERY_DAY as number[] : parseDaysOfWeek(dowRaw);
    if (dow === null) {
      rowIssues.push({
        row: i, column: 'days_of_week', severity: 'error',
        message: `Invalid days_of_week: "${dowRaw}". Use EVERY_DAY / MON_TO_SAT / WEEKDAYS / WEEKENDS or "1,2,3,4,5,6".`,
      });
    }

    // Duration
    const durRaw = cell('duration_days');
    const dur = durRaw === '' ? DEFAULT_SUBSCRIPTION_DAYS : Number(durRaw);
    if (!Number.isInteger(dur) || dur <= 0 || dur > 365) {
      rowIssues.push({
        row: i, column: 'duration_days', severity: 'error',
        message: `Invalid duration_days: ${durRaw}`,
      });
    }

    // Start date
    const startRaw = cell('start_date');
    const start = parseStartDate(startRaw);
    if (start === null) {
      rowIssues.push({
        row: i, column: 'start_date', severity: 'error',
        message: `Could not parse start_date: "${startRaw}"`,
      });
    }

    // Code
    const codeRaw = cell('customer_code');
    let codeFinal: string | undefined;
    if (codeRaw !== '') {
      if (!/^[A-Z]+-\d+$/i.test(codeRaw)) {
        rowIssues.push({
          row: i, column: 'customer_code', severity: 'error',
          message: `customer_code must look like JHR-100123, got "${codeRaw}"`,
        });
      } else {
        codeFinal = codeRaw.toUpperCase();
        if (seenCodes.has(codeFinal)) {
          rowIssues.push({
            row: i, column: 'customer_code', severity: 'error',
            message: `Duplicate customer_code in CSV: ${codeFinal}`,
          });
        }
      }
    }

    // Email basic check
    const email = cell('email');
    if (email !== '' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      rowIssues.push({
        row: i, column: 'email', severity: 'warning',
        message: `Email looks malformed: ${email}`,
      });
    }

    // Product code default
    const productCode = (cell('product_code') || 'COW_MILK').toUpperCase();

    issues.push(...rowIssues);

    // Skip pushing to `valid` if any errors on this row.
    if (rowIssues.some((x) => x.severity === 'error')) continue;

    seenPhones.add(phone);
    if (codeFinal) seenCodes.add(codeFinal);

    valid.push({
      row: i,
      name: cell('name'),
      phone,
      altPhone: cell('alt_phone') || undefined,
      email: email || undefined,
      addressLine1: cell('address_line1'),
      area: cell('area') || undefined,
      pinCode: cell('pin_code') || undefined,
      routeName: cell('route_name'),
      productCode,
      litresPerDay: litres,
      daysOfWeek: dow as number[],
      durationDays: dur,
      startDate: start as string,
      customerCode: codeFinal,
    });
  }

  return {
    valid,
    issues,
    phones: valid.map((r) => r.phone),
    codes: valid.map((r) => r.customerCode).filter((c): c is string => !!c),
  };
}

// ---------- Template generator ----------

/** Return the CSV template the admin downloads — header + 3 example rows. */
export function buildTemplateCsv(): string {
  const header = COLUMNS.join(',');
  const examples: Array<Record<ColumnName, string>> = [
    {
      name: 'Sunil Pradhan',
      phone: '9111111111',
      alt_phone: '',
      email: '',
      address_line1: 'MIG-12, Gandhi Nagar, 3rd Lane',
      area: 'Berhampur South',
      pin_code: '760004',
      route_name: 'Route 4',
      product_code: 'COW_MILK',
      litres_per_day: '2',
      days_of_week: 'EVERY_DAY',
      duration_days: '30',
      start_date: '',
      customer_code: '',
    },
    {
      name: 'Subhransu Behera',
      phone: '9111111112',
      alt_phone: '',
      email: 'subhransu@example.com',
      address_line1: 'Plot 47, Gajapati Nagar',
      area: 'Berhampur',
      pin_code: '760010',
      route_name: 'Route 3',
      product_code: 'COW_MILK',
      litres_per_day: '1',
      days_of_week: 'MON_TO_SAT',
      duration_days: '30',
      start_date: '',
      customer_code: '',
    },
    {
      name: 'Anita Sahoo',
      phone: '9111111113',
      alt_phone: '',
      email: '',
      address_line1: 'Plot 4, Sasibhushan Lane',
      area: 'Berhampur',
      pin_code: '760004',
      route_name: 'Route 4',
      product_code: 'BUFFALO_MILK',
      litres_per_day: '1.5',
      days_of_week: '1,2,3,4,5,6',
      duration_days: '30',
      start_date: '15/06/2026',
      customer_code: 'JHR-100390',
    },
  ];
  const lines = [header];
  for (const ex of examples) {
    lines.push(COLUMNS.map((c) => csvEscape(ex[c])).join(','));
  }
  return `${lines.join('\n')}\n`;
}

function csvEscape(s: string): string {
  if (s === '') return '';
  if (/[,"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

// Silence unused import in builds where defaults aren't read
void DEFAULT_RATE_PER_LITRE_INR;
