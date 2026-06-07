/**
 * Date utilities — all UTC-based to match the DB.
 *
 * The IST→UTC conversion happens at the API boundary (Topbar / mobile UI).
 * Internally everything is UTC midnight-aligned for delivery scheduling so
 * a "delivery for 2 Jun" never depends on the server's local timezone.
 */

import { ONE_DAY_MS } from '../constants';

/** Truncate a Date to UTC midnight. */
export function startOfDayUTC(d: Date = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

/** Add days (positive or negative). Returns a new Date at UTC midnight. */
export function addDays(d: Date, n: number): Date {
  const x = startOfDayUTC(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x;
}

/** Inclusive day difference (b - a). */
export function daysBetween(a: Date, b: Date): number {
  return Math.round((startOfDayUTC(b).getTime() - startOfDayUTC(a).getTime()) / ONE_DAY_MS);
}

/** ISO date (YYYY-MM-DD) — what we use at API and bot boundaries. */
export function isoDate(d: Date): string {
  return startOfDayUTC(d).toISOString().slice(0, 10);
}
