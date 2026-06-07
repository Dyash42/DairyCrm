/**
 * Bulk customer import — unit tests for the pure parser + validator.
 *
 * No DB, no Prisma. Only exercises the in-memory CSV → ValidatedRow pipeline.
 * The DB cross-checks (route exists, phone uniqueness vs DB) live in the
 * REST handler and are exercised in integration tests separately.
 */

import { describe, it, expect } from 'vitest';
import {
  COLUMNS,
  parseCsv,
  validateCsv,
  buildTemplateCsv,
} from './bulk-customer-import';

const HEADER = COLUMNS.join(',');

function rowFor(over: Partial<Record<(typeof COLUMNS)[number], string>>): string {
  const defaults: Record<string, string> = {
    name: 'Anita Sahoo',
    phone: '9111111113',
    alt_phone: '',
    email: '',
    address_line1: 'Plot 4, Sasibhushan Lane',
    area: 'Berhampur',
    pin_code: '760004',
    route_name: 'Route 4',
    product_code: 'COW_MILK',
    litres_per_day: '1.5',
    days_of_week: 'EVERY_DAY',
    duration_days: '30',
    start_date: '',
    customer_code: '',
    ...over,
  };
  return COLUMNS.map((c) => {
    const v = defaults[c] ?? '';
    return /[,"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  }).join(',');
}

describe('parseCsv', () => {
  it('parses a plain header + row', () => {
    const out = parseCsv('a,b,c\n1,2,3\n');
    expect(out).toEqual([
      ['a', 'b', 'c'],
      ['1', '2', '3'],
    ]);
  });

  it('handles CRLF line endings', () => {
    const out = parseCsv('a,b\r\n1,2\r\n');
    expect(out).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });

  it('handles quoted fields with commas', () => {
    const out = parseCsv('a,b\n"Hello, world",2\n');
    expect(out[1]).toEqual(['Hello, world', '2']);
  });

  it('handles escaped double-quotes inside quoted fields', () => {
    const out = parseCsv('a,b\n"She said ""hi""",2\n');
    expect(out[1]).toEqual(['She said "hi"', '2']);
  });

  it('does not lose the last row if no trailing newline', () => {
    const out = parseCsv('a,b\n1,2');
    expect(out).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ]);
  });
});

describe('validateCsv — happy paths', () => {
  it('accepts a single valid row', () => {
    const csv = `${HEADER}\n${rowFor({})}\n`;
    const res = validateCsv(csv);
    expect(res.issues).toEqual([]);
    expect(res.valid).toHaveLength(1);
    expect(res.valid[0]).toMatchObject({
      name: 'Anita Sahoo',
      phone: '+919111111113',
      routeName: 'Route 4',
      litresPerDay: 1.5,
      productCode: 'COW_MILK',
      durationDays: 30,
    });
  });

  it('defaults productCode to COW_MILK when blank', () => {
    const csv = `${HEADER}\n${rowFor({ product_code: '' })}\n`;
    const res = validateCsv(csv);
    expect(res.valid[0]?.productCode).toBe('COW_MILK');
  });

  it('defaults daysOfWeek to EVERY_DAY when blank', () => {
    const csv = `${HEADER}\n${rowFor({ days_of_week: '' })}\n`;
    const res = validateCsv(csv);
    expect(res.valid[0]?.daysOfWeek).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('parses MON_TO_SAT shorthand', () => {
    const csv = `${HEADER}\n${rowFor({ days_of_week: 'MON_TO_SAT' })}\n`;
    const res = validateCsv(csv);
    expect(res.valid[0]?.daysOfWeek).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('parses WEEKDAYS shorthand', () => {
    const csv = `${HEADER}\n${rowFor({ days_of_week: 'WEEKDAYS' })}\n`;
    const res = validateCsv(csv);
    expect(res.valid[0]?.daysOfWeek).toEqual([1, 2, 3, 4, 5]);
  });

  it('parses WEEKENDS shorthand', () => {
    const csv = `${HEADER}\n${rowFor({ days_of_week: 'WEEKENDS' })}\n`;
    const res = validateCsv(csv);
    expect(res.valid[0]?.daysOfWeek).toEqual([0, 6]);
  });

  it('parses numeric list "1,2,3,4,5,6"', () => {
    const csv = `${HEADER}\n${rowFor({ days_of_week: '1,2,3,4,5,6' })}\n`;
    const res = validateCsv(csv);
    expect(res.valid[0]?.daysOfWeek).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('normalizes phone with bare 10 digits to +91…', () => {
    const csv = `${HEADER}\n${rowFor({ phone: '9123456789' })}\n`;
    const res = validateCsv(csv);
    expect(res.valid[0]?.phone).toBe('+919123456789');
  });

  it('normalizes phone with 91 prefix to +91…', () => {
    const csv = `${HEADER}\n${rowFor({ phone: '919123456789' })}\n`;
    const res = validateCsv(csv);
    expect(res.valid[0]?.phone).toBe('+919123456789');
  });

  it('parses DD/MM/YYYY start_date', () => {
    const csv = `${HEADER}\n${rowFor({ start_date: '15/06/2026' })}\n`;
    const res = validateCsv(csv);
    expect(res.valid[0]?.startDate).toBe('2026-06-15');
  });

  it('parses YYYY-MM-DD start_date', () => {
    const csv = `${HEADER}\n${rowFor({ start_date: '2026-06-15' })}\n`;
    const res = validateCsv(csv);
    expect(res.valid[0]?.startDate).toBe('2026-06-15');
  });

  it('parses "DD MMM YYYY" start_date', () => {
    const csv = `${HEADER}\n${rowFor({ start_date: '15 Jun 2026' })}\n`;
    const res = validateCsv(csv);
    expect(res.valid[0]?.startDate).toBe('2026-06-15');
  });

  it('uppercases an explicit customer_code', () => {
    const csv = `${HEADER}\n${rowFor({ customer_code: 'jhr-100390' })}\n`;
    const res = validateCsv(csv);
    expect(res.valid[0]?.customerCode).toBe('JHR-100390');
    expect(res.codes).toEqual(['JHR-100390']);
  });
});

describe('validateCsv — errors', () => {
  it('flags an empty file', () => {
    const res = validateCsv('');
    expect(res.valid).toEqual([]);
    expect(res.issues[0]).toMatchObject({ severity: 'error', message: /empty/i });
  });

  it('flags a missing required header', () => {
    // Drop the 'phone' column
    const headerNoPhone = COLUMNS.filter((c) => c !== 'phone').join(',');
    const res = validateCsv(`${headerNoPhone}\nfoo\n`);
    expect(res.valid).toEqual([]);
    expect(res.issues[0]?.message).toMatch(/phone/);
  });

  it('flags a missing required cell value (no name)', () => {
    const csv = `${HEADER}\n${rowFor({ name: '' })}\n`;
    const res = validateCsv(csv);
    expect(res.valid).toEqual([]);
    const nameIssue = res.issues.find((i) => i.column === 'name');
    expect(nameIssue?.severity).toBe('error');
  });

  it('flags duplicate phone within the same CSV', () => {
    const csv = [
      HEADER,
      rowFor({ name: 'A', phone: '9000000001' }),
      rowFor({ name: 'B', phone: '9000000001' }),
    ].join('\n');
    const res = validateCsv(csv);
    expect(res.valid).toHaveLength(1); // first one keeps, second flagged
    const dupIssue = res.issues.find((i) => /Duplicate phone/.test(i.message));
    expect(dupIssue?.severity).toBe('error');
  });

  it('flags an out-of-range litres_per_day', () => {
    const csv = `${HEADER}\n${rowFor({ litres_per_day: '999' })}\n`;
    const res = validateCsv(csv);
    expect(res.valid).toEqual([]);
    expect(res.issues.some((i) => i.column === 'litres_per_day')).toBe(true);
  });

  it('flags a zero or negative litres_per_day', () => {
    const csv = `${HEADER}\n${rowFor({ litres_per_day: '0' })}\n`;
    const res = validateCsv(csv);
    expect(res.valid).toEqual([]);
  });

  it('flags an unparseable days_of_week', () => {
    const csv = `${HEADER}\n${rowFor({ days_of_week: 'tuesdays-and-thursdays' })}\n`;
    const res = validateCsv(csv);
    expect(res.valid).toEqual([]);
    expect(res.issues.some((i) => i.column === 'days_of_week')).toBe(true);
  });

  it('flags a day index outside 0..6', () => {
    const csv = `${HEADER}\n${rowFor({ days_of_week: '0,1,2,9' })}\n`;
    const res = validateCsv(csv);
    expect(res.valid).toEqual([]);
  });

  it('flags an invalid duration_days', () => {
    const csv = `${HEADER}\n${rowFor({ duration_days: '500' })}\n`;
    const res = validateCsv(csv);
    expect(res.valid).toEqual([]);
  });

  it('flags an unparseable start_date', () => {
    const csv = `${HEADER}\n${rowFor({ start_date: 'next tuesday' })}\n`;
    const res = validateCsv(csv);
    expect(res.valid).toEqual([]);
    expect(res.issues.some((i) => i.column === 'start_date')).toBe(true);
  });

  it('flags a malformed customer_code', () => {
    const csv = `${HEADER}\n${rowFor({ customer_code: 'no-such-format!' })}\n`;
    const res = validateCsv(csv);
    expect(res.valid).toEqual([]);
  });

  it('flags duplicate customer_code within the same CSV', () => {
    const csv = [
      HEADER,
      rowFor({ name: 'A', phone: '9000000001', customer_code: 'JHR-100001' }),
      rowFor({ name: 'B', phone: '9000000002', customer_code: 'JHR-100001' }),
    ].join('\n');
    const res = validateCsv(csv);
    expect(res.valid).toHaveLength(1);
    expect(res.issues.some((i) => /Duplicate customer_code/.test(i.message))).toBe(true);
  });

  it('warns (not errors) on a malformed email', () => {
    const csv = `${HEADER}\n${rowFor({ email: 'not-an-email' })}\n`;
    const res = validateCsv(csv);
    expect(res.valid).toHaveLength(1); // warning does not block
    expect(res.issues[0]?.severity).toBe('warning');
  });
});

describe('validateCsv — bulk shape', () => {
  it('handles 50 valid rows', () => {
    const lines = [HEADER];
    for (let i = 0; i < 50; i++) {
      lines.push(
        rowFor({
          name: `Customer ${i}`,
          phone: `90000${String(i).padStart(5, '0')}`,
        }),
      );
    }
    const res = validateCsv(lines.join('\n'));
    expect(res.issues).toEqual([]);
    expect(res.valid).toHaveLength(50);
    expect(res.phones).toHaveLength(50);
    expect(new Set(res.phones).size).toBe(50); // all unique
  });

  it('preserves row numbers for error reporting (1-based, skipping header)', () => {
    const csv = [
      HEADER,
      rowFor({ name: 'good', phone: '9000000001' }),
      rowFor({ name: '', phone: '9000000002' }), // row 2 → bad
      rowFor({ name: 'good2', phone: '9000000003' }),
    ].join('\n');
    const res = validateCsv(csv);
    const badRow = res.issues.find((i) => i.column === 'name');
    expect(badRow?.row).toBe(2);
  });
});

describe('buildTemplateCsv', () => {
  it('produces a CSV that round-trips through validateCsv with zero errors', () => {
    const template = buildTemplateCsv();
    const res = validateCsv(template);
    expect(res.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(res.valid.length).toBeGreaterThanOrEqual(3);
  });

  it('starts with the canonical header row', () => {
    const template = buildTemplateCsv();
    const firstLine = template.split('\n')[0];
    expect(firstLine).toBe(COLUMNS.join(','));
  });

  it('escapes commas inside quoted address fields', () => {
    const template = buildTemplateCsv();
    // Example row 1 has "MIG-12, Gandhi Nagar, 3rd Lane" which must be quoted
    expect(template).toContain('"MIG-12, Gandhi Nagar, 3rd Lane"');
  });
});
