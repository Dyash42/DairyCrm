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
 * Implementation note: Prisma's interactive transaction wraps in a SQL tx.
 * We `update` the counter row with `lastValue: { increment: 1 }` and then
 * read the resulting `lastValue`. Postgres serializes concurrent updates on
 * the same row, so two callers can never see the same value.
 *
 * The counter row must exist — seed handles that. If for any reason it
 * doesn't (e.g. fresh dev DB, no seed), we create it with a sensible default
 * via upsert on first call.
 */
export async function nextCustomerCode(
  prisma: PrismaClient,
  prefix: CustomerCodePrefix = CUSTOMER_CODE_PREFIX,
): Promise<string> {
  const row = await prisma.$transaction(async (tx) => {
    const existing = await tx.customerCodeCounter.findUnique({ where: { key: COUNTER_KEY } });
    if (existing) {
      return tx.customerCodeCounter.update({
        where: { key: COUNTER_KEY },
        data: { lastValue: { increment: 1 } },
      });
    }
    return tx.customerCodeCounter.create({
      data: { key: COUNTER_KEY, lastValue: CUSTOMER_CODE_INITIAL + 1 },
    });
  });
  return formatCustomerCode(row.lastValue, prefix);
}
