/**
 * Dashboard module — aggregate metrics for the admin home page.
 *
 * GET /dashboard/metrics?range=TODAY|WEEK|MONTH
 *
 * Returns the same shape as the admin's mock DashboardMetrics so the UI
 * can drop in a real data source with no shape changes.
 *
 * Calibration changes (Phase 1 audit fixes):
 *   - Admin role guard added (was authenticated-only; executives could
 *     read business revenue, subscription counts, completion %)
 *   - delta% fields now compute real prior-period deltas (were hardcoded
 *     to 0 — every trend arrow in the UI was meaningless)
 *   - hourlyDelivery now also returns a daily series for WEEK/MONTH so
 *     the chart card on the dashboard isn't blank outside TODAY
 *   - "today" boundary uses BUSINESS_TZ (Asia/Kolkata) — UTC midnight
 *     was 5.5hr behind, which broke the 00:00–05:29 IST window
 */

import type { App } from '../../types';
import { z } from 'zod';
import { DeliveryStatus, SubscriptionStatus } from '@prisma/client';

import { prisma } from '../../prisma';
import { startOfBusinessDayUTC } from '../../utils/dates';

const Query = z.object({
  range: z.enum(['TODAY', 'WEEK', 'MONTH']).default('TODAY'),
});

type Range = 'TODAY' | 'WEEK' | 'MONTH';

interface Window {
  from: Date;
  to: Date; // exclusive
}

/** Current window for the requested range, in business-TZ-aligned UTC. */
function currentWindow(range: Range): Window {
  const today = startOfBusinessDayUTC();
  const to = new Date(today.getTime() + 86_400_000); // exclusive end of today
  if (range === 'TODAY') return { from: today, to };
  if (range === 'WEEK') {
    const from = new Date(today);
    from.setUTCDate(from.getUTCDate() - 6);
    return { from, to };
  }
  // MONTH — calendar month containing today
  const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
  return { from, to };
}

/** The matching prior window, used for delta% comparison. */
function priorWindow(range: Range): Window {
  const cur = currentWindow(range);
  if (range === 'TODAY') {
    const from = new Date(cur.from);
    from.setUTCDate(from.getUTCDate() - 1);
    return { from, to: cur.from };
  }
  if (range === 'WEEK') {
    const from = new Date(cur.from);
    from.setUTCDate(from.getUTCDate() - 7);
    return { from, to: cur.from };
  }
  // MONTH — the SAME elapsed slice of the previous month (month-to-date vs
  // month-to-same-day), not the full prior month. Comparing a partial current
  // month against a complete prior month made every month-over-month delta
  // look catastrophically negative early in the month.
  const from = new Date(Date.UTC(cur.from.getUTCFullYear(), cur.from.getUTCMonth() - 1, 1));
  const elapsedMs = cur.to.getTime() - cur.from.getTime();
  return { from, to: new Date(from.getTime() + elapsedMs) };
}

/** Percent-change from prior → current, rounded to int. Returns 0 if prior is 0. */
function pctChange(current: number, prior: number): number {
  if (prior <= 0) return 0;
  return Math.round(((current - prior) / prior) * 100);
}

/**
 * Compute the four core aggregates over a window so we can call this
 * once for "current" and once for "prior" to get delta percentages.
 */
async function aggregates(window: Window): Promise<{
  litresDelivered: number;
  customersServed: number;
  customersScheduled: number;
  revenue: number;
  completionPct: number;
}> {
  const [deliveries, payments] = await Promise.all([
    prisma.delivery.findMany({
      where: { scheduledFor: { gte: window.from, lt: window.to } },
      select: { status: true, deliveredLitres: true, scheduledLitres: true },
    }),
    prisma.payment.aggregate({
      where: { status: 'PAID', paidAt: { gte: window.from, lt: window.to } },
      _sum: { amount: true },
    }),
  ]);
  const total = deliveries.length;
  const delivered = deliveries.filter(
    (d) => d.status === DeliveryStatus.DELIVERED || d.status === DeliveryStatus.PARTIAL,
  );
  const litresDelivered = delivered.reduce(
    (sum, d) => sum + Number(d.deliveredLitres ?? d.scheduledLitres),
    0,
  );
  return {
    litresDelivered: Math.round(litresDelivered * 10) / 10,
    customersServed: delivered.length,
    customersScheduled: total,
    revenue: Number(payments._sum.amount ?? 0),
    completionPct: total > 0 ? Math.round((delivered.length / total) * 100) : 0,
  };
}

export async function registerDashboardRoutes(app: App) {
  // Admin-only — the dashboard exposes business revenue, customer counts,
  // subscription health, and per-route completion. Without this guard
  // any authenticated EXECUTIVE could quantify the business from the
  // mobile login JWT.
  app.addHook('onRequest', app.authenticate);
  app.addHook('onRequest', app.requireRole('ADMIN'));

  app.get('/metrics', {
    handler: async (req) => {
      const { range } = Query.parse(req.query);
      const cur = currentWindow(range);
      const prev = priorWindow(range);

      const [current, prior, deliveriesForBreakdown, subs] = await Promise.all([
        aggregates(cur),
        aggregates(prev),
        // We re-fetch deliveries because aggregates() doesn't return
        // the per-row data we need for the hourly/daily chart and the
        // by-route breakdown.
        prisma.delivery.findMany({
          where: { scheduledFor: { gte: cur.from, lt: cur.to } },
          include: { route: { select: { id: true, name: true } } },
        }),
        prisma.subscription.groupBy({
          by: ['status'],
          _count: { _all: true },
        }),
      ]);

      const pending = deliveriesForBreakdown.filter(
        (d) => d.status === DeliveryStatus.PENDING,
      ).length;
      const missed = deliveriesForBreakdown.filter(
        (d) => d.status === DeliveryStatus.MISSED,
      ).length;
      const paused =
        subs.find((s) => s.status === SubscriptionStatus.PAUSED)?._count._all ?? 0;

      // by route — completion + litres
      const byRouteMap = new Map<
        string,
        { name: string; litres: number; total: number; delivered: number }
      >();
      for (const d of deliveriesForBreakdown) {
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

      // Hourly (TODAY) or daily (WEEK/MONTH) delivery series.
      //
      // The previous code only filled `hourlyDelivery` for TODAY and
      // returned [] for WEEK/MONTH, so the prominent chart card on the
      // dashboard was blank when the admin clicked any other range. We
      // now compute a daily series for those, with the same {x, y}
      // shape so the UI can switch axis labels but keep the same chart.
      const series: Array<{ hour: number; litres: number; dateLabel?: string }> = [];
      if (range === 'TODAY') {
        // Bucket by IST hour (UTC+5:30) so the chart's hour labels match the
        // business timezone. Bucketing by UTC hour shifted every bar 5.5h
        // earlier than when the delivery actually happened locally.
        const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;
        const hourly = new Map<number, number>();
        for (const d of deliveriesForBreakdown) {
          if (!d.scannedAt) continue;
          if (d.status !== DeliveryStatus.DELIVERED && d.status !== DeliveryStatus.PARTIAL) {
            continue;
          }
          const h = new Date(d.scannedAt.getTime() + IST_OFFSET_MS).getUTCHours();
          hourly.set(
            h,
            (hourly.get(h) ?? 0) + Number(d.deliveredLitres ?? d.scheduledLitres),
          );
        }
        for (const [hour, litres] of Array.from(hourly.entries()).sort(([a], [b]) => a - b)) {
          series.push({ hour, litres: Math.round(litres * 10) / 10 });
        }
      } else {
        // Daily bucketing keyed by YYYY-MM-DD of scheduledFor.
        const daily = new Map<string, number>();
        for (const d of deliveriesForBreakdown) {
          if (d.status !== DeliveryStatus.DELIVERED && d.status !== DeliveryStatus.PARTIAL) {
            continue;
          }
          const k = d.scheduledFor.toISOString().slice(0, 10);
          daily.set(k, (daily.get(k) ?? 0) + Number(d.deliveredLitres ?? d.scheduledLitres));
        }
        // Fill every day in the window (including zeros) so the chart
        // doesn't skip dates with no deliveries.
        const cursor = new Date(cur.from);
        let hourIdx = 0;
        while (cursor < cur.to) {
          const k = cursor.toISOString().slice(0, 10);
          series.push({
            hour: hourIdx, // for the chart's X-axis ordering
            litres: Math.round((daily.get(k) ?? 0) * 10) / 10,
            dateLabel: k,
          });
          cursor.setUTCDate(cursor.getUTCDate() + 1);
          hourIdx += 1;
        }
      }

      const subscriptionCounts = {
        active:
          subs.find((s) => s.status === SubscriptionStatus.ACTIVE)?._count._all ?? 0,
        paused,
        cancelled:
          subs.find((s) => s.status === SubscriptionStatus.CANCELLED)?._count._all ?? 0,
      };
      const subscriptionsTotal =
        subscriptionCounts.active +
        subscriptionCounts.paused +
        subscriptionCounts.cancelled;

      const newToday = await prisma.customer.count({
        where: { createdAt: { gte: startOfBusinessDayUTC() } },
      });

      return {
        range,
        litresDelivered: current.litresDelivered,
        litresDeltaPct: pctChange(current.litresDelivered, prior.litresDelivered),
        customersServed: current.customersServed,
        customersScheduled: current.customersScheduled,
        customersDeltaPct: pctChange(current.customersServed, prior.customersServed),
        revenue: current.revenue,
        revenueDeltaPct: pctChange(current.revenue, prior.revenue),
        completionPct: current.completionPct,
        completionDeltaPct: pctChange(current.completionPct, prior.completionPct),
        hourlyDelivery: series,
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
