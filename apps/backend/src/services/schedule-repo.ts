/**
 * Prisma-backed ScheduleRepo — the single source the scheduling engine reads
 * from. Previously duplicated in modules/deliveries and jobs/daily-route-gen,
 * which drifted (only one had the holiday-batch + customer-status fixes). One
 * implementation now serves both.
 */
import { prisma } from '../prisma';
import type { ScheduleRepo } from './scheduling';

export function buildScheduleRepo(): ScheduleRepo {
  // Per-pass holiday cache: getDeliveriesForDate calls isHoliday once per
  // subscription; memoize by date so it's one query/pass, not N (audit PER-01).
  const holidayCache = new Map<string, { all: boolean; routes: Set<string> }>();
  return {
    async listSubscriptionsActiveOn() {
      const rows = await prisma.subscription.findMany({
        // Exclude subscriptions whose customer is not ACTIVE — a cancelled
        // customer must never be scheduled even with a stale ACTIVE sub
        // (audit ADM-02 backstop).
        where: { status: 'ACTIVE', customer: { status: 'ACTIVE' } },
        include: { customer: true },
      });
      return rows.map((s) => ({
        id: s.id,
        customerId: s.customerId,
        routeId: s.customer.routeId,
        productId: s.productId,
        litresPerDay: Number(s.litresPerDay),
        ratePerLitre: Number(s.ratePerLitre),
        daysOfWeek: s.daysOfWeek,
        startDate: s.startDate,
        endDate: s.endDate,
        status: s.status,
      }));
    },
    async listPausesOverlapping(date) {
      return prisma.pauseRecord.findMany({
        where: { startDate: { lte: date }, endDate: { gte: date } },
        select: { subscriptionId: true, startDate: true, endDate: true },
      });
    },
    async isHoliday(date, routeId) {
      const key = date.toISOString().slice(0, 10);
      let entry = holidayCache.get(key);
      if (!entry) {
        const rows = await prisma.holidayCalendar.findMany({
          where: { date },
          select: { scope: true },
        });
        const routes = new Set(rows.map((r) => r.scope));
        entry = { all: routes.has('ALL'), routes };
        holidayCache.set(key, entry);
      }
      return entry.all || (routeId != null && entry.routes.has(routeId));
    },
  };
}
