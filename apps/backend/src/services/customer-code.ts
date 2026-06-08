/**
 * Customer code generator — JHR-XXXXXX.
 *
 * Safety-critical: collision causes duplicate Customer.code unique-constraint
 * violations, which break onboarding. The atomic increment is done inside a
 * Prisma transaction so concurrent onboardings can't pick the same number.
 *
 * Format: PRD §2 mentions a "Unique Customer ID". Visible example throughout
 * the design PDFs is `JHR-100455` — 6-digit incremental counter prefixed with
 * `JHR-`. We use a single-row table keyed by 'customer' so we can extend
 * later (`JHR-INV-XXX` invoices etc.) using the same machinery.
 */

import type { PrismaClient } from '@prisma/client';

import { CUSTOMER_CODE_INITIAL, CUSTOMER_CODE_PREFIX } from '../constants';

export type CustomerCodePrefix = typeof CUSTOMER_CODE_PREFIX;

const COUNTER_KEY = 'customer';

/**
 * Pure formatting — exposed for testing and for the seed file.
 * Pads to 6 digits like `JHR-100455`. We don't truncate at 6 — if we ever
 * cross 999_999 customers, the code just gets longer, which is fine.
 */
export function formatCustomerCode(value: number, prefix: CustomerCodePrefix = CUSTOMER_CODE_PREFIX): string {
  if (!Number.isInteger(value) || value < 1) {
    throw new RangeError(`customer code value must be a positive integer, got ${value}`);
  }
  return `${prefix}-${String(value).padStart(6, '0')}`;
}

/**
 * Parse back — defensive. Returns null if the string isn't a valid code.
 * Used by the QR scanner pipeline to validate scanned payloads.
 */
export function parseCustomerCode(s: string): { prefix: string; value: number } | null {
  const m = /^([A-Z]+)-(\d+)$/.exec(s.trim());
  if (!m || !m[1] || !m[2]) return null;
  const value = Number(m[2]);
  if (!Number.isInteger(value) || value < 1) return null;
  return { prefix: m[1], value };
}

/**
 * Atomically allocate the next code.
 *
 * Implementation: `upsert` so the find+create-or-update is ONE statement
 * — the previous "findUnique → create OR update" two-step had a race on
 * a fresh DB. Two parallel onboardings both saw `existing === null` and
 * both tried `create`; the second hit the primary-key unique violation
 * and 500ed. Postgres serializes the upsert on the (key) primary key,
 * so concurrent callers always see distinct lastValue.
 */
export async function nextCustomerCode(
  prisma: PrismaClient,
  prefix: CustomerCodePrefix = CUSTOMER_CODE_PREFIX,
): Promise<string> {
  const row = await prisma.customerCodeCounter.upsert({
    where: { key: COUNTER_KEY },
    create: { key: COUNTER_KEY, lastValue: CUSTOMER_CODE_INITIAL + 1 },
    update: { lastValue: { increment: 1 } },
  });
  return formatCustomerCode(row.lastValue, prefix);
}
