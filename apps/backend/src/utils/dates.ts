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
 * UTC instant aligned to start-of-day in the business timezone.
 *
 * Why this matters: a delivery cron firing at 00:15 IST (=18:45 UTC the
 * previous day) needs "today" to mean today-IST, not today-UTC. The
 * previous `startOfTodayUTC()` was off by 5.5 hours, causing the
 * 00:00–05:29 IST window to materialize against yesterday's date and
 * silently skip the milkman's actual morning route.
 *
 * Returns a Date whose UTC instant is midnight at the *business* day
 * boundary — so storing/comparing against Prisma's UTC timestamps is
 * the same shape as before, just with the right anchor.
 */
export function startOfBusinessDayUTC(
  now: Date = new Date(),
  tz: string = 'Asia/Kolkata',
): Date {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (k: 'year' | 'month' | 'day'): number => {
    const part = parts.find((p) => p.type === k);
    return part ? Number(part.value) : 0;
  };
  const y = get('year');
  const m = get('month') - 1;
  const d = get('day');
  // Build the UTC instant matching that business-local midnight.
  // For IST (+5:30) that means the UTC date is the same day at 00:00.
  // We model the business day as an Asia/Kolkata calendar day; the UTC
  // anchor we expose is just the UTC midnight of that calendar date
  // because all our Prisma date columns store as UTC midnight and we
  // need to compare like-for-like.
  return new Date(Date.UTC(y, m, d));
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
