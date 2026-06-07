/**
 * Subscription calculation engine — pure functions.
 *
 * Safety-critical: these compute the rupee amount we send to the customer
 * in the Razorpay payment link. Off-by-one in `countDeliveriesInRange`
 * means the customer pays for fewer or extra deliveries.
 *
 * Per PRD §2: amount = X × rate × days.
 * Per PRD §3: "calculates total quantity for Y days and amount".
 *
 * All functions are pure — no Prisma, no Date.now(). Pass `today` in
 * explicitly so tests can pin behavior on any calendar date.
 */

export type WeekdayNumber = 0 | 1 | 2 | 3 | 4 | 5 | 6; // 0=Sun … 6=Sat

export interface QuoteInput {
  litresPerDay: number;
  ratePerLitre: number;
  /** PRD §3 — pattern of weekdays customer subscribes to. */
  daysOfWeek: WeekdayNumber[];
  /** Window the renewal/onboarding covers. Inclusive. */
  startDate: Date;
  durationDays: number;
}

export interface QuoteResult {
  litresPerDay: number;
  ratePerLitre: number;
  durationDays: number;
  deliveryCount: number;
  totalLitres: number;
  /** ₹ amount in whole rupees (we never charge paise via the WhatsApp link). */
  amount: number;
}

/**
 * Calculate the rupee amount + delivery count for a (litres, days-of-week,
 * duration) quote. Rounded to the nearest rupee — Razorpay payment links
 * don't accept paise on standard plans, and the PRD's example shows
 * `1 L × 30 days × ₹64 = ₹1,920` (whole rupees).
 */
export function calculateQuote(input: QuoteInput): QuoteResult {
  if (input.litresPerDay <= 0) {
    throw new RangeError(`litresPerDay must be positive, got ${input.litresPerDay}`);
  }
  if (input.ratePerLitre <= 0) {
    throw new RangeError(`ratePerLitre must be positive, got ${input.ratePerLitre}`);
  }
  if (input.durationDays <= 0 || !Number.isInteger(input.durationDays)) {
    throw new RangeError(`durationDays must be a positive integer, got ${input.durationDays}`);
  }
  if (input.daysOfWeek.length === 0) {
    throw new RangeError('daysOfWeek must not be empty');
  }

  const deliveryCount = countDeliveriesInRange(
    input.startDate,
    input.durationDays,
    input.daysOfWeek,
  );
  const totalLitres = round1(deliveryCount * input.litresPerDay);
  const amount = Math.round(totalLitres * input.ratePerLitre);

  return {
    litresPerDay: input.litresPerDay,
    ratePerLitre: input.ratePerLitre,
    durationDays: input.durationDays,
    deliveryCount,
    totalLitres,
    amount,
  };
}

/**
 * Count how many delivery days fall within a window of `durationDays`
 * starting at `startDate`, considering only the requested days of the week.
 *
 * The window is INCLUSIVE of startDate, so durationDays=1 means "just today".
 */
export function countDeliveriesInRange(
  startDate: Date,
  durationDays: number,
  daysOfWeek: WeekdayNumber[],
  /** Business timezone — defaults to IST since the dairy runs in Berhampur. */
  tz: string = 'Asia/Kolkata',
): number {
  const wanted = new Set<number>(daysOfWeek);
  const start = startOfDayUTC(startDate);
  let count = 0;
  for (let i = 0; i < durationDays; i++) {
    const d = new Date(start);
    d.setUTCDate(d.getUTCDate() + i);
    // Use the IST weekday — UTC weekday would mis-classify any IST early
    // morning (00:00-05:29) as the previous day, breaking MON_TO_SAT
    // patterns at the boundary.
    const wd = weekdayFromTz(d, tz);
    if (wanted.has(wd)) count += 1;
  }
  return count;
}

function weekdayFromTz(d: Date, tz: string): number {
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' });
  const name = fmt.format(d);
  const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name);
  return idx === -1 ? d.getUTCDay() : idx;
}

/**
 * Calculate when a subscription should renew given its start date,
 * duration in days, and a list of historical pause records.
 *
 * Logic: nominal end = startDate + durationDays (exclusive). Each pause
 * fully inside the window extends the end by (endDate - startDate + 1).
 * Returns the renewal date (the day AFTER the last delivery).
 */
export function nextRenewalDate(
  startDate: Date,
  durationDays: number,
  pauses: Array<{ startDate: Date; endDate: Date }> = [],
): Date {
  let end = new Date(startOfDayUTC(startDate));
  end.setUTCDate(end.getUTCDate() + durationDays);
  for (const p of pauses) {
    const pausedDays = daysBetween(p.startDate, p.endDate) + 1;
    end.setUTCDate(end.getUTCDate() + pausedDays);
  }
  return end;
}

/**
 * How many more deliveries are owed before the subscription expires.
 */
export function deliveriesRemaining(
  today: Date,
  endDate: Date,
  daysOfWeek: WeekdayNumber[],
): number {
  const todayUtc = startOfDayUTC(today);
  const end = startOfDayUTC(endDate);
  if (end < todayUtc) return 0;
  const days = daysBetween(todayUtc, end) + 1;
  return countDeliveriesInRange(todayUtc, days, daysOfWeek);
}

// ---------- helpers ----------

function startOfDayUTC(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function daysBetween(a: Date, b: Date): number {
  const aUtc = startOfDayUTC(a);
  const bUtc = startOfDayUTC(b);
  return Math.round((bUtc.getTime() - aUtc.getTime()) / 86_400_000);
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/** Convenience constants — PRD-aligned daysOfWeek patterns. */
export const DAYS_OF_WEEK = {
  EVERY_DAY: [0, 1, 2, 3, 4, 5, 6] as WeekdayNumber[],
  MON_TO_SAT: [1, 2, 3, 4, 5, 6] as WeekdayNumber[],
  WEEKDAYS: [1, 2, 3, 4, 5] as WeekdayNumber[],
  WEEKENDS: [0, 6] as WeekdayNumber[],
};
