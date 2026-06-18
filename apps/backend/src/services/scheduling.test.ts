import { describe, it, expect } from 'vitest';
import {
  getDeliveriesForDate,
  groupByRoute,
  type ScheduleRepo,
  type ScheduleSubscription,
  type SchedulePause,
} from './scheduling';
import { calculateQuote } from './subscription-calc';

const utc = (s: string) => new Date(s + 'T00:00:00.000Z');

// ---------- in-memory test repo ----------

function makeRepo(opts: {
  subs?: ScheduleSubscription[];
  pauses?: SchedulePause[];
  holidays?: Date[];
  routeHolidays?: Array<{ routeId: string; date: Date }>;
} = {}): ScheduleRepo {
  return {
    async listSubscriptionsActiveOn() {
      return opts.subs ?? [];
    },
    async listPausesOverlapping() {
      return opts.pauses ?? [];
    },
    async isHoliday(date, routeId) {
      const all = (opts.holidays ?? []).some(
        (h) => h.toISOString().slice(0, 10) === date.toISOString().slice(0, 10),
      );
      if (all) return true;
      if (routeId) {
        return (opts.routeHolidays ?? []).some(
          (rh) =>
            rh.routeId === routeId &&
            rh.date.toISOString().slice(0, 10) === date.toISOString().slice(0, 10),
        );
      }
      return false;
    },
  };
}

const baseSub = (overrides: Partial<ScheduleSubscription> = {}): ScheduleSubscription => ({
  id: 's1',
  customerId: 'c1',
  routeId: 'r1',
  productId: 'p1',
  litresPerDay: 1,
  ratePerLitre: 64,
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  startDate: utc('2026-01-01'),
  endDate: null,
  status: 'ACTIVE',
  ...overrides,
});

// ---------- tests ----------

describe('getDeliveriesForDate', () => {
  it('returns nothing when there are no subscriptions', async () => {
    const repo = makeRepo();
    const out = await getDeliveriesForDate(utc('2026-06-02'), repo);
    expect(out).toEqual([]);
  });

  it('returns one delivery per active EVERY_DAY subscription', async () => {
    const repo = makeRepo({ subs: [baseSub()] });
    const out = await getDeliveriesForDate(utc('2026-06-02'), repo);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ customerId: 'c1', routeId: 'r1', litres: 1 });
  });

  it('skips subscriptions whose daysOfWeek does not match today', async () => {
    // 7 Jun 2026 is a Sunday (UTC day 0). Mon-Sat subscriber should NOT get a delivery.
    const repo = makeRepo({
      subs: [baseSub({ daysOfWeek: [1, 2, 3, 4, 5, 6] })],
    });
    const out = await getDeliveriesForDate(utc('2026-06-07'), repo);
    expect(out).toEqual([]);
  });

  it('skips subscriptions that are paused today (PRD §4)', async () => {
    const repo = makeRepo({
      subs: [baseSub()],
      pauses: [
        { subscriptionId: 's1', startDate: utc('2026-06-01'), endDate: utc('2026-06-05') },
      ],
    });
    const onPauseDay = await getDeliveriesForDate(utc('2026-06-03'), repo);
    expect(onPauseDay).toEqual([]);
  });

  it('resumes deliveries the day after pause ends (PRD §4: "Auto-resume on End Date + 1")', async () => {
    const repo = makeRepo({
      subs: [baseSub()],
      pauses: [
        { subscriptionId: 's1', startDate: utc('2026-06-01'), endDate: utc('2026-06-05') },
      ],
    });
    // The repo's listPausesOverlapping is per-day in production; the test fake returns
    // all pauses regardless of date, which is fine because the engine still checks
    // isWithinRange. On 6 Jun the pause has ended → delivery resumes.
    const after = await getDeliveriesForDate(utc('2026-06-06'), repo);
    expect(after).toHaveLength(1);
  });

  it('skips holidays (ALL scope)', async () => {
    const repo = makeRepo({
      subs: [baseSub()],
      holidays: [utc('2026-08-15')],
    });
    const onHoliday = await getDeliveriesForDate(utc('2026-08-15'), repo);
    expect(onHoliday).toEqual([]);
  });

  it('skips route-specific holidays only for matching routes', async () => {
    const repo = makeRepo({
      subs: [baseSub({ routeId: 'r1' }), baseSub({ id: 's2', customerId: 'c2', routeId: 'r2' })],
      routeHolidays: [{ routeId: 'r1', date: utc('2026-06-02') }],
    });
    const out = await getDeliveriesForDate(utc('2026-06-02'), repo);
    expect(out).toHaveLength(1);
    expect(out[0]?.customerId).toBe('c2');
  });

  it('respects subscription start/end window (endDate EXCLUSIVE — audit DAT-05)', async () => {
    // endDate is the EXCLUSIVE renewal boundary (= startDate + durationDays),
    // so the LAST delivery is the day before endDate. A [10 Jun, 20 Jun) window
    // delivers 10..19 Jun and NOT on 20 Jun — matching what the customer is
    // billed (10 deliveries), not 11.
    const repo = makeRepo({
      subs: [
        baseSub({
          startDate: utc('2026-06-10'),
          endDate: utc('2026-06-20'),
        }),
      ],
    });
    expect(await getDeliveriesForDate(utc('2026-06-09'), repo)).toEqual([]); // before start
    expect(await getDeliveriesForDate(utc('2026-06-10'), repo)).toHaveLength(1); // start = first delivery
    expect(await getDeliveriesForDate(utc('2026-06-19'), repo)).toHaveLength(1); // last delivery
    expect(await getDeliveriesForDate(utc('2026-06-20'), repo)).toEqual([]); // endDate itself: none (exclusive)
    expect(await getDeliveriesForDate(utc('2026-06-21'), repo)).toEqual([]); // after
  });

  it('delivers exactly `durationDays` deliveries == the billed quote (audit DAT-05)', async () => {
    // The invariant that closes DAT-05: for the SAME (startDate, durationDays,
    // daysOfWeek), the number of days the scheduler delivers over the stored
    // window [startDate, startDate + durationDays) must equal
    // calculateQuote(...).deliveryCount — i.e. the customer is billed for
    // exactly what they receive. Verified for EVERY_DAY (30) and MON_TO_SAT (26).
    const start = utc('2026-06-01');
    for (const { dow, expected } of [
      { dow: [0, 1, 2, 3, 4, 5, 6], expected: 30 },
      { dow: [1, 2, 3, 4, 5, 6], expected: 26 },
    ]) {
      const durationDays = 30;
      const endDate = new Date(start);
      endDate.setUTCDate(endDate.getUTCDate() + durationDays);
      const repo = makeRepo({
        subs: [baseSub({ daysOfWeek: dow, startDate: start, endDate })],
      });
      // Count delivering days across a generous span that fully contains the window.
      let delivered = 0;
      for (let i = -1; i <= durationDays + 1; i++) {
        const d = new Date(start);
        d.setUTCDate(d.getUTCDate() + i);
        delivered += (await getDeliveriesForDate(d, repo)).length;
      }
      // The pure billing math (subscription-calc) and the scheduler agree.
      const billed = calculateQuote({
        litresPerDay: 1,
        ratePerLitre: 64,
        daysOfWeek: dow as never,
        startDate: start,
        durationDays,
      }).deliveryCount;
      expect(delivered).toBe(expected);
      expect(delivered).toBe(billed);
    }
  });

  it('skips non-ACTIVE subscriptions even if the repo returned them', async () => {
    const repo = makeRepo({
      subs: [baseSub({ status: 'CANCELLED' }), baseSub({ id: 's2', customerId: 'c2', status: 'PAUSED' })],
    });
    expect(await getDeliveriesForDate(utc('2026-06-02'), repo)).toEqual([]);
  });
});

describe('groupByRoute', () => {
  it('groups by routeId and bucket unassigned to "unassigned"', () => {
    const sd = (over: { customerId: string; routeId: string | null; litres: number }) => ({
      subscriptionId: `sub-${over.customerId}`,
      productId: 'p1',
      ratePerLitre: 64,
      date: utc('2026-06-02'),
      ...over,
    });
    const grouped = groupByRoute([
      sd({ customerId: 'c1', routeId: 'r1', litres: 1 }),
      sd({ customerId: 'c2', routeId: 'r1', litres: 2 }),
      sd({ customerId: 'c3', routeId: 'r2', litres: 1 }),
      sd({ customerId: 'c4', routeId: null, litres: 1 }),
    ]);
    expect(grouped.get('r1')).toHaveLength(2);
    expect(grouped.get('r2')).toHaveLength(1);
    expect(grouped.get('unassigned')).toHaveLength(1);
  });
});
