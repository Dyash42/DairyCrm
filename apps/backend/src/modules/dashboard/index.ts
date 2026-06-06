/**
 * Dashboard module — aggregate metrics for the admin home page.
 *
 * GET /dashboard/metrics?range=TODAY|WEEK|MONTH
 *
 * Returns the same shape as the admin's mock DashboardMetrics so the UI
 * can drop in a real data source with no shape changes.
 */

import type { App } from '../../types';
import { z } from 'zod';
import { DeliveryStatus, SubscriptionStatus } from '@prisma/client';

import { prisma } from '../../prisma';

const Query = z.object({
  range: z.enum(['TODAY', 'WEEK', 'MONTH']).default('TODAY'),
});

function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function rangeStart(range: 'TODAY' | 'WEEK' | 'MONTH'): Date {
  const today = startOfTodayUTC();
  if (range === 'TODAY') return today;
  if (range === 'WEEK') {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - 6);
    return d;
  }
  // MONTH
  const d = new Date(today);
  d.setUTCDate(1);
  return d;
}

export async function registerDashboardRoutes(app: App) {
  app.addHook('onRequest', app.authenticate);

  app.get('/metrics', {
    handler: async (req) => {
      const { range } = req.query as z.infer<typeof Query>;
      const from = rangeStart(range);
      const to = new Date(startOfTodayUTC().getTime() + 86_400_000); // tomorrow 00:00

      const deliveries = await prisma.delivery.findMany({
        where: { scheduledFor: { gte: from, lt: to } },
        include: { route: { select: { id: true, name: true } } },
      });
      const subs = await prisma.subscription.groupBy({
        by: ['status'],
        _count: { _all: true },
      });

      const total = deliveries.length;
      const delivered = deliveries.filter(
        (d) => d.status === DeliveryStatus.DELIVERED || d.status === DeliveryStatus.PARTIAL,
      );
      const litresDelivered = delivered.reduce(
        (sum, d) => sum + Number(d.deliveredLitres ?? d.scheduledLitres),
        0,
      );
      const pending = deliveries.filter((d) => d.status === DeliveryStatus.PENDING).length;
      const missed = deliveries.filter((d) => d.status === DeliveryStatus.MISSED).length;
      const paused = subs.find((s) => s.status === SubscriptionStatus.PAUSED)?._count._all ?? 0;
      const completionPct = total > 0 ? Math.round((delivered.length / total) * 100) : 0;

      // by route
      const byRouteMap = new Map<string, { name: string; litres: number; total: number; delivered: number }>();
      for (const d of deliveries) {
        const key = d.route?.id ?? 'unassigned';
        const name = d.route?.name ?? 'Unassigned';
        const e = byRouteMap.get(key) ?? { name, litres: 0, total: 0, delivered: 0 };
        e.total += 1;
        if (d.status === DeliveryStatus.DELIVERED || d.status === DeliveryStatus.PARTIAL) {
          e.litres += Number(d.deliveredLitres ?? d.scheduledLitres);
          e.delivered += 1;
        }
        byRouteMap.set(key, e);
      }
      const byRoute = Array.from(byRouteMap.values()).map((r) => ({
        routeName: r.name,
        litres: Math.round(r.litres * 10) / 10,
        completionPct: r.total > 0 ? Math.round((r.delivered / r.total) * 100) : 0,
      }));

      // hourly delivery (only meaningful for TODAY)
      const hourlyBuckets = new Map<number, number>();
      if (range === 'TODAY') {
        for (const d of delivered) {
          if (!d.scannedAt) continue;
          const h = d.scannedAt.getUTCHours();
          hourlyBuckets.set(h, (hourlyBuckets.get(h) ?? 0) + Number(d.deliveredLitres ?? 0));
        }
      }
      const hourlyDelivery = Array.from(hourlyBuckets.entries())
        .sort(([a], [b]) => a - b)
        .map(([hour, litres]) => ({ hour, litres: Math.round(litres * 10) / 10 }));

      // subscriptions breakdown
      const subscriptionCounts = {
        active: subs.find((s) => s.status === SubscriptionStatus.ACTIVE)?._count._all ?? 0,
        paused,
        cancelled: subs.find((s) => s.status === SubscriptionStatus.CANCELLED)?._count._all ?? 0,
      };
      const subscriptionsTotal =
        subscriptionCounts.active + subscriptionCounts.paused + subscriptionCounts.cancelled;

      // Revenue: confirmed payments in the range
      const payments = await prisma.payment.aggregate({
        where: { status: 'PAID', paidAt: { gte: from, lt: to } },
        _sum: { amount: true },
      });
      const revenue = Number(payments._sum.amount ?? 0);

      // newToday: customers created today
      const newToday = await prisma.customer.count({
        where: { createdAt: { gte: startOfTodayUTC() } },
      });

      return {
        range,
        litresDelivered: Math.round(litresDelivered * 10) / 10,
        litresDeltaPct: 0,
        customersServed: delivered.length,
        customersScheduled: total,
        customersDeltaPct: 0,
        revenue,
        revenueDeltaPct: 0,
        completionPct,
        completionDeltaPct: 0,
        hourlyDelivery,
        breakdown: { pending, missed, paused, newToday },
        byRoute,
        subscriptions: {
          ...subscriptionCounts,
          total: subscriptionsTotal,
        },
      };
    },
  });
}
