/**
 * Day-of-week pattern parsing + labelling for the WhatsApp money flows
 * (onboarding + renew). Shared so both quote the SAME way and a fix lands once.
 *
 * CUS-07: parseDaysOfWeek returns `null` for unrecognized input so the caller
 * can re-prompt instead of silently defaulting to a pattern and charging the
 * wrong amount.
 */

import type { WeekdayNumber } from '../services/subscription-calc';

/**
 * Parse a customer's free-text day pattern into a sorted weekday list
 * (0=Sun … 6=Sat), or `null` if it can't be understood.
 */
export function parseDaysOfWeek(text: string): WeekdayNumber[] | null {
  const lower = text.toLowerCase();
  if (lower.includes('all') || lower.includes('every') || lower.includes('daily')) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  if (lower.includes('mon-sat') || lower.includes('mon–sat') || lower.includes('mon to sat')) {
    return [1, 2, 3, 4, 5, 6];
  }
  if (lower.includes('weekday')) return [1, 2, 3, 4, 5];
  if (lower.includes('weekend')) return [0, 6];
  return null; // unparseable — caller re-prompts
}

/**
 * Render a normalized human label for a parsed weekday list, so quotes read
 * "Every day" / "Mon–Sat" / "Weekdays" / "Weekends" rather than echoing the
 * raw user text. Falls back to a short comma list for any other combination.
 */
export function formatDayPattern(daysOfWeek: WeekdayNumber[]): string {
  const sorted = [...daysOfWeek].sort((a, b) => a - b);
  const key = sorted.join(',');
  if (key === '0,1,2,3,4,5,6') return 'Every day';
  if (key === '1,2,3,4,5,6') return 'Mon–Sat';
  if (key === '1,2,3,4,5') return 'Weekdays';
  if (key === '0,6') return 'Weekends';
  const NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return sorted.map((d) => NAMES[d]).join(', ');
}
