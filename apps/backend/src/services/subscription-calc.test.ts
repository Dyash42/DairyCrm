import { describe, it, expect } from 'vitest';
import {
  calculateQuote,
  countDeliveriesInRange,
  nextRenewalDate,
  deliveriesRemaining,
  DAYS_OF_WEEK,
} from './subscription-calc';

const utc = (s: string) => new Date(s + 'T00:00:00.000Z');

describe('countDeliveriesInRange', () => {
  it('counts every day for EVERY_DAY pattern (PRD §2 onboarding example)', () => {
    // 30-day window, every day
    expect(countDeliveriesInRange(utc('2026-06-01'), 30, DAYS_OF_WEEK.EVERY_DAY)).toBe(30);
  });

  it('matches the PDF example "Mon–Sat for 30 days = 26 deliveries"', () => {
    // PDF flow 02 shows: "Mon–Sat for 30 days = 26 deliveries"
    // 30 days starting Monday: 4 full weeks (24 deliveries) + 2 extra days = 26.
    // Starting Mon 1 Jun 2026 → counts 26 Mon-Sat days in [1 Jun, 30 Jun].
    expect(
      countDeliveriesInRange(utc('2026-06-01'), 30, DAYS_OF_WEEK.MON_TO_SAT),
    ).toBe(26);
  });

  it('counts weekday-only deliveries (Mon–Fri)', () => {
    expect(countDeliveriesInRange(utc('2026-06-01'), 7, DAYS_OF_WEEK.WEEKDAYS)).toBe(5);
  });

  it('counts weekend-only deliveries', () => {
    expect(countDeliveriesInRange(utc('2026-06-01'), 14, DAYS_OF_WEEK.WEEKENDS)).toBe(4);
  });

  it('handles a single-day window correctly', () => {
    // 1 Jun 2026 is a Monday — it's in MON_TO_SAT
    expect(countDeliveriesInRange(utc('2026-06-01'), 1, DAYS_OF_WEEK.MON_TO_SAT)).toBe(1);
    // 7 Jun 2026 is a Sunday — NOT in MON_TO_SAT
    expect(countDeliveriesInRange(utc('2026-06-07'), 1, DAYS_OF_WEEK.MON_TO_SAT)).toBe(0);
  });
});

describe('calculateQuote', () => {
  it('matches the PDF onboarding example exactly: 1 L × 30 days × ₹64 = ₹1,920', () => {
    const q = calculateQuote({
      litresPerDay: 1,
      ratePerLitre: 64,
      daysOfWeek: DAYS_OF_WEEK.EVERY_DAY,
      startDate: utc('2026-06-01'),
      durationDays: 30,
    });
    expect(q.deliveryCount).toBe(30);
    expect(q.totalLitres).toBe(30);
    expect(q.amount).toBe(1920);
  });

  it('matches the PDF renew example: Mon–Sat × 30 days = 26 × 1 L × ₹64 = ₹1,664', () => {
    const q = calculateQuote({
      litresPerDay: 1,
      ratePerLitre: 64,
      daysOfWeek: DAYS_OF_WEEK.MON_TO_SAT,
      startDate: utc('2026-06-01'),
      durationDays: 30,
    });
    expect(q.deliveryCount).toBe(26);
    expect(q.totalLitres).toBe(26);
    expect(q.amount).toBe(1664);
  });

  it('handles 1.5 L/day (a common partial-litre subscription)', () => {
    const q = calculateQuote({
      litresPerDay: 1.5,
      ratePerLitre: 64,
      daysOfWeek: DAYS_OF_WEEK.EVERY_DAY,
      startDate: utc('2026-06-01'),
      durationDays: 30,
    });
    expect(q.totalLitres).toBe(45);
    expect(q.amount).toBe(2880);
  });

  it('rejects bad input rather than producing a wrong quote', () => {
    expect(() =>
      calculateQuote({
        litresPerDay: 0,
        ratePerLitre: 64,
        daysOfWeek: DAYS_OF_WEEK.EVERY_DAY,
        startDate: utc('2026-06-01'),
        durationDays: 30,
      }),
    ).toThrow(RangeError);

    expect(() =>
      calculateQuote({
        litresPerDay: 1,
        ratePerLitre: 64,
        daysOfWeek: [],
        startDate: utc('2026-06-01'),
        durationDays: 30,
      }),
    ).toThrow(RangeError);

    expect(() =>
      calculateQuote({
        litresPerDay: 1,
        ratePerLitre: 64,
        daysOfWeek: DAYS_OF_WEEK.EVERY_DAY,
        startDate: utc('2026-06-01'),
        durationDays: 0,
      }),
    ).toThrow(RangeError);
  });
});

describe('nextRenewalDate', () => {
  it('start + N days for a no-pause subscription', () => {
    const r = nextRenewalDate(utc('2026-06-01'), 30);
    expect(r.toISOString().slice(0, 10)).toBe('2026-07-01');
  });

  it('extends by total paused days', () => {
    // Pause 3 Jun → 9 Jun = 7 days. End shifts by 7.
    const r = nextRenewalDate(utc('2026-06-01'), 30, [
      { startDate: utc('2026-06-03'), endDate: utc('2026-06-09') },
    ]);
    expect(r.toISOString().slice(0, 10)).toBe('2026-07-08');
  });
});

describe('deliveriesRemaining', () => {
  it('returns 0 when today is past endDate', () => {
    expect(
      deliveriesRemaining(utc('2026-08-01'), utc('2026-07-01'), DAYS_OF_WEEK.EVERY_DAY),
    ).toBe(0);
  });

  it('counts remaining days inclusively', () => {
    // 25 Jun → 30 Jun inclusive = 6 days, all Mon-Sun
    const n = deliveriesRemaining(
      utc('2026-06-25'),
      utc('2026-06-30'),
      DAYS_OF_WEEK.EVERY_DAY,
    );
    expect(n).toBe(6);
  });
});
