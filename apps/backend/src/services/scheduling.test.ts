import { describe, it, expect } from 'vitest';
import {
  getDeliveriesForDate,
  groupByRoute,
  type ScheduleRepo,
  type ScheduleSubscription,
  type SchedulePause,
} from './scheduling';

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

  it('respects subscription start/end window', async () => {
    const repo = makeRepo({
      subs: [
        baseSub({
          startDate: utc('2026-06-10'),
          endDate: utc('2026-06-20'),
        }),
      ],
    });
    expect(await getDeliveriesForDate(utc('2026-06-09'), repo)).toEqual([]);
    expect(await getDeliveriesForDate(utc('2026-06-10'), repo)).toHaveLength(1);
    expect(await getDeliveriesForDate(utc('2026-06-20'), repo)).toHaveLength(1);
    expect(await getDeliveriesForDate(utc('2026-06-21'), repo)).toEqual([]);
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
    const grouped = groupByRoute([
      { customerId: 'c1', routeId: 'r1', litres: 1, ratePerLitre: 64, date: utc('2026-06-02') },
      { customerId: 'c2', routeId: 'r1', litres: 2, ratePerLitre: 64, date: utc('2026-06-02') },
      { customerId: 'c3', routeId: 'r2', litres: 1, ratePerLitre: 64, date: utc('2026-06-02') },
      { customerId: 'c4', routeId: null, litres: 1, ratePerLitre: 64, date: utc('2026-06-02') },
    ]);
    expect(grouped.get('r1')).toHaveLength(2);
    expect(grouped.get('r2')).toHaveLength(1);
    expect(grouped.get('unassigned')).toHaveLength(1);
  });
});
