/**
 * Daily route generation cron.
 *
 * Runs at midnight IST (≈ 18:30 UTC the previous day) to materialize
 * Delivery rows for today across every active subscription. The
 * deliveries module also has lazy on-demand materialization so a missed
 * cron run isn't fatal — but having this cron means the admin sees the
 * day's plan at 12:01 AM, not first time the milkman opens his app.
 */

import { DeliveryStatus } from '@prisma/client';

import { prisma } from '../prisma';
import {
  getDeliveriesForDate,
  type ScheduleRepo,
} from '../services/scheduling';

function buildScheduleRepo(): ScheduleRepo {
  return {
    async listSubscriptionsActiveOn() {
      const rows = await prisma.subscription.findMany({
        where: { status: 'ACTIVE' },
        include: { customer: true },
      });
      return rows.map((s) => ({
        id: s.id,
        customerId: s.customerId,
        routeId: s.customer.routeId,
        litresPerDay: Number(s.litresPerDay),
        daysOfWeek: s.daysOfWeek,
        startDate: s.startDate,
        endDate: s.endDate,
        status: s.status,
      }));
    },
    async listPausesOverlapping(date) {
      return prisma.pauseRecord.findMany({
        where: {
          startDate: { lte: date },
          endDate: { gte: date },
        },
        select: { subscriptionId: true, startDate: true, endDate: true },
      });
    },
    async isHoliday(date, routeId) {
      const row = await prisma.holidayCalendar.findFirst({
        where: {
          date,
          OR: [{ scope: 'ALL' }, ...(routeId ? [{ scope: routeId }] : [])],
        },
      });
      return row !== null;
    },
  };
}

export async function runDailyRouteGenOnce(today: Date = startOfTodayUTC()): Promise<{
  date: string;
  created: number;
  alreadyExisting: number;
}> {
  const existing = await prisma.delivery.count({ where: { scheduledFor: today } });
  if (existing > 0) {
    return { date: today.toISOString().slice(0, 10), created: 0, alreadyExisting: existing };
  }

  const planned = await getDeliveriesForDate(today, buildScheduleRepo());
  if (planned.length === 0) {
    return { date: today.toISOString().slice(0, 10), created: 0, alreadyExisting: 0 };
  }

  await prisma.delivery.createMany({
    data: planned
      .filter((p) => p.routeId !== null)
      .map((p) => ({
        customerId: p.customerId,
        routeId: p.routeId as string,
        scheduledLitres: p.litres,
        scheduledFor: p.date,
        status: DeliveryStatus.PENDING,
      })),
    skipDuplicates: true,
  });

  return {
    date: today.toISOString().slice(0, 10),
    created: planned.length,
    alreadyExisting: 0,
  };
}

function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
