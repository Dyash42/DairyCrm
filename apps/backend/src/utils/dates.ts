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

/**
 * Weekday number (0=Sunday … 6=Saturday) for the given Date interpreted
 * in the business timezone. The dairy operates in IST (Asia/Kolkata).
 *
 * Why this exists: `getUTCDay()` returns the UTC weekday, which can be a
 * different day than the local one. A delivery scheduled at IST 06:00
 * Monday is at UTC 00:30 Monday — same weekday — but a delivery at IST
 * 04:00 Monday is UTC 22:30 Sunday, so getUTCDay() says Sunday. For
 * MON_TO_SAT subscribers that bug skips Monday's first delivery silently.
 *
 * Defaults to Asia/Kolkata; pass a different IANA name for tests.
 */
export function weekdayInTz(d: Date, tz: string = 'Asia/Kolkata'): number {
  // Intl.DateTimeFormat with weekday: 'short' returns 'Sun', 'Mon', etc.
  // We map back to 0..6. This is the only reliable cross-platform way
  // since `Date` itself has no concept of a non-local timezone.
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    weekday: 'short',
  });
  const name = fmt.format(d);
  const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
  return idx === -1 ? d.getUTCDay() : idx;
}
