/**
 * Daily scheduling engine — "what gets delivered today?"
 *
 * Per PRD §6 the milkman's app shows today's route with the customer list.
 * This service is the source of truth for that list. It considers:
 *   - active subscriptions (status === ACTIVE)
 *   - subscription's daysOfWeek (does today match?)
 *   - pause records (is today inside any pause window?)
 *   - holidays (is today on the HolidayCalendar?)
 *   - subscription's start/end window
 *
 * The engine is pure-ish: data comes in via an injectable repo so this is
 * unit-testable without Postgres. Production wires it to a Prisma-backed
 * repo; tests pass in an in-memory fake.
 */

import type { WeekdayNumber } from './subscription-calc';
import { weekdayInTz } from '../utils/dates';
import { loadConfig } from '../config';

// ---------- repo contract (injectable) ----------

export interface ScheduleSubscription {
  id: string;
  customerId: string;
  routeId: string | null;
  /** Product this subscription delivers — carried onto the Delivery so a
   *  multi-product customer gets one delivery per product (audit DAT-03). */
  productId: string | null;
  litresPerDay: number;
  /** Rate at subscription creation — snapshotted on each Delivery so
   *  historical billing doesn't change retroactively when admin edits
   *  the Product's rate. */
  ratePerLitre: number;
  daysOfWeek: number[];
  startDate: Date;
  endDate: Date | null;
  /** ACTIVE | PAUSED | CANCELLED */
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
}

export interface SchedulePause {
  subscriptionId: string;
  startDate: Date;
  endDate: Date;
}

export interface ScheduleRepo {
  listSubscriptionsActiveOn(date: Date): Promise<ScheduleSubscription[]>;
  listPausesOverlapping(date: Date): Promise<SchedulePause[]>;
  isHoliday(date: Date, routeId?: string | null): Promise<boolean>;
}

export interface ScheduledDelivery {
  customerId: string;
  subscriptionId: string;
  productId: string | null;
  routeId: string | null;
  litres: number;
  /** Snapshotted from the subscription so billing is stable. */
  ratePerLitre: number;
  date: Date;
}

// ---------- core ----------

/**
 * Compute the set of deliveries that should happen on `date`.
 * Returns a flat list — callers (cron, scheduling job) write Delivery rows
 * for each entry. Idempotent: re-running for the same date produces the
 * same set, and the unique (customerId, scheduledFor) constraint on
 * Delivery prevents duplicates.
 */
export async function getDeliveriesForDate(
  date: Date,
  repo: ScheduleRepo,
): Promise<ScheduledDelivery[]> {
  const day = startOfDayUTC(date);
  // Compute weekday in the BUSINESS timezone, not UTC. UTC midnight in
  // India is 05:30 IST the SAME calendar day — but if scheduling ever
  // runs near the day boundary or against a date pulled from the DB
  // (already UTC midnight), the IST weekday is what the customer sees.
  const tz = loadConfig().BUSINESS_TZ;
  const weekday = weekdayInTz(day, tz) as WeekdayNumber;

  const [subs, pauses] = await Promise.all([
    repo.listSubscriptionsActiveOn(day),
    repo.listPausesOverlapping(day),
  ]);

  // Quick lookup: subscriptions paused today.
  const pausedSubs = new Set<string>();
  for (const p of pauses) {
    if (isWithinRange(day, p.startDate, p.endDate)) {
      pausedSubs.add(p.subscriptionId);
    }
  }

  const out: ScheduledDelivery[] = [];
  for (const s of subs) {
    if (s.status !== 'ACTIVE') continue;
    if (pausedSubs.has(s.id)) continue;
    if (!s.daysOfWeek.includes(weekday)) continue;
    // Subscription window. endDate is the EXCLUSIVE renewal boundary
    // (= startDate + durationDays, i.e. the day AFTER the last delivery), so a
    // 30-day subscription delivers on exactly 30 calendar days — the half-open
    // window [startDate, endDate). This matches countDeliveriesInRange and the
    // payment quote (1L × 30 days = 30 deliveries), so billed === delivered
    // (audit DAT-05). Previously this used `day > endDate`, delivering on
    // endDate too (N+1) while onboarding/renew billed only N.
    if (day < startOfDayUTC(s.startDate)) continue;
    if (s.endDate && day >= startOfDayUTC(s.endDate)) continue;
    // Holidays — check both ALL-scope and route-specific
    const isHolidayToday = await repo.isHoliday(day, s.routeId);
    if (isHolidayToday) continue;

    out.push({
      customerId: s.customerId,
      subscriptionId: s.id,
      productId: s.productId,
      routeId: s.routeId,
      litres: s.litresPerDay,
      ratePerLitre: s.ratePerLitre,
      date: day,
    });
  }
  return out;
}

/**
 * Per-route grouping for the milkman's app (PRD §6: sequenced customer list).
 */
export function groupByRoute(
  deliveries: ScheduledDelivery[],
): Map<string | 'unassigned', ScheduledDelivery[]> {
  const out = new Map<string | 'unassigned', ScheduledDelivery[]>();
  for (const d of deliveries) {
    const key = d.routeId ?? 'unassigned';
    const list = out.get(key);
    if (list) list.push(d);
    else out.set(key, [d]);
  }
  return out;
}

// ---------- helpers ----------

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isWithinRange(d: Date, start: Date, end: Date): boolean {
  const t = startOfDayUTC(d).getTime();
  return t >= startOfDayUTC(start).getTime() && t <= startOfDayUTC(end).getTime();
}
