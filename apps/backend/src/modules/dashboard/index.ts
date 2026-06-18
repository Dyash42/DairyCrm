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
 *
 * PER-03: every aggregate is computed in SQL (COUNT/SUM with FILTER,
 * GROUP BY, TZ-aware bucketing) instead of `findMany`-ing the whole
 * window into memory and reducing in JS. At 1k subscribers a MONTH view
 * was loading ~75k Delivery rows per request (current + prior windows +
 * a full breakdown fetch); now it's a handful of grouped queries.
 */

import type { App } from '../../types';
import { z } from 'zod';
import { Prisma, SubscriptionStatus } from '@prisma/client';

import { prisma } from '../../prisma';
import { startOfBusinessDayUTC } from '../../utils/dates';
import { loadConfig } from '../../config';

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

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

interface CoreAggregate {
  litresDelivered: number;
  customersServed: number;
  customersScheduled: number;
  revenue: number;
  completionPct: number;
}

/**
 * The four core aggregates over a window — one grouped SQL pass for the
 * delivery side (count + delivered count + Σ COALESCE(delivered, scheduled)
 * litres) plus the payment sum. Called once for "current" and once for
 * "prior" to derive delta percentages.
 */
async function aggregates(window: Window): Promise<CoreAggregate> {
  const [rows, payments] = await Promise.all([
    prisma.$queryRaw<Array<{ total: number; delivered: number; litres: number }>>`
      SELECT
        COUNT(*)::int AS total,
        COUNT(*) FILTER (WHERE "status"::text IN ('DELIVERED', 'PARTIAL'))::int AS delivered,
        COALESCE(
          SUM(COALESCE("deliveredLitres", "scheduledLitres"))
            FILTER (WHERE "status"::text IN ('DELIVERED', 'PARTIAL')),
          0
        )::float8 AS litres
      FROM "Delivery"
      WHERE "scheduledFor" >= ${window.from} AND "scheduledFor" < ${window.to}
    `,
    prisma.payment.aggregate({
      where: { status: 'PAID', paidAt: { gte: window.from, lt: window.to } },
      _sum: { amount: true },
    }),
  ]);
  const r = rows[0] ?? { total: 0, delivered: 0, litres: 0 };
  const total = Number(r.total);
  const delivered = Number(r.delivered);
  return {
    litresDelivered: round1(Number(r.litres)),
    customersServed: delivered,
    customersScheduled: total,
    revenue: Number(payments._sum.amount ?? 0),
    completionPct: total > 0 ? Math.round((delivered / total) * 100) : 0,
  };
}

/**
 * Hourly (TODAY) or daily (WEEK/MONTH) delivered-litres series, bucketed in
 * SQL. TODAY buckets by the hour of `scannedAt` in the BUSINESS timezone
 * (scannedAt is a UTC `timestamp`, so we re-anchor it to UTC then convert to
 * the business zone before extracting the hour). WEEK/MONTH bucket by the
 * `scheduledFor` calendar date and zero-fill every day in the window.
 */
async function deliverySeries(
  range: Range,
  cur: Window,
  tz: string,
): Promise<Array<{ hour: number; litres: number; dateLabel?: string }>> {
  if (range === 'TODAY') {
    const rows = await prisma.$queryRaw<Array<{ hour: number; litres: number }>>`
      SELECT
        EXTRACT(HOUR FROM ("scannedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${tz}))::int AS hour,
        COALESCE(SUM(COALESCE("deliveredLitres", "scheduledLitres")), 0)::float8 AS litres
      FROM "Delivery"
      WHERE "scheduledFor" >= ${cur.from} AND "scheduledFor" < ${cur.to}
        AND "status"::text IN ('DELIVERED', 'PARTIAL')
        AND "scannedAt" IS NOT NULL
      GROUP BY 1
      ORDER BY 1
    `;
    return rows.map((r) => ({ hour: Number(r.hour), litres: round1(Number(r.litres)) }));
  }

  const rows = await prisma.$queryRaw<Array<{ k: string; litres: number }>>`
    SELECT
      to_char("scheduledFor", 'YYYY-MM-DD') AS k,
      COALESCE(SUM(COALESCE("deliveredLitres", "scheduledLitres")), 0)::float8 AS litres
    FROM "Delivery"
    WHERE "scheduledFor" >= ${cur.from} AND "scheduledFor" < ${cur.to}
      AND "status"::text IN ('DELIVERED', 'PARTIAL')
    GROUP BY 1
  `;
  const daily = new Map(rows.map((r) => [r.k, Number(r.litres)]));
  // Fill every day in the window (including zeros) so the chart doesn't skip
  // dates with no deliveries.
  const series: Array<{ hour: number; litres: number; dateLabel?: string }> = [];
  const cursor = new Date(cur.from);
  let hourIdx = 0;
  while (cursor < cur.to) {
    const k = cursor.toISOString().slice(0, 10);
    series.push({ hour: hourIdx, litres: round1(daily.get(k) ?? 0), dateLabel: k });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    hourIdx += 1;
  }
  return series;
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
      const tz = loadConfig().BUSINESS_TZ;

      const [
        current,
        prior,
        statusCounts,
        byRouteRows,
        routes,
        subs,
        newToday,
        unroutedActive,
        series,
      ] = await Promise.all([
        aggregates(cur),
        aggregates(prev),
        // pending/missed counts for the current window.
        prisma.delivery.groupBy({
          by: ['status'],
          where: { scheduledFor: { gte: cur.from, lt: cur.to } },
          _count: { _all: true },
        }),
        // by-route completion + litres, grouped in SQL.
        prisma.$queryRaw<
          Array<{ routeId: string | null; total: number; delivered: number; litres: number }>
        >`
          SELECT
            "routeId",
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE "status"::text IN ('DELIVERED', 'PARTIAL'))::int AS delivered,
            COALESCE(
              SUM(COALESCE("deliveredLitres", "scheduledLitres"))
                FILTER (WHERE "status"::text IN ('DELIVERED', 'PARTIAL')),
              0
            )::float8 AS litres
          FROM "Delivery"
          WHERE "scheduledFor" >= ${cur.from} AND "scheduledFor" < ${cur.to}
          GROUP BY "routeId"
        `,
        prisma.route.findMany({ select: { id: true, name: true } }),
        prisma.subscription.groupBy({ by: ['status'], _count: { _all: true } }),
        prisma.customer.count({ where: { createdAt: { gte: startOfBusinessDayUTC() } } }),
        // Active customers with an ACTIVE subscription but NO route — billing-
        // eligible subscribers the materializer can never schedule (it filters
        // routeId !== null), a silent revenue leak surfaced as an alert
        // (audit EDG-04/BAC-08).
        prisma.customer.count({
          where: {
            status: 'ACTIVE',
            routeId: null,
            subscriptions: { some: { status: SubscriptionStatus.ACTIVE } },
          },
        }),
        deliverySeries(range, cur, tz),
      ]);

      const countByStatus = (s: string) =>
        statusCounts.find((c) => c.status === s)?._count._all ?? 0;
      const pending = countByStatus('PENDING');
      const missed = countByStatus('MISSED');

      // by route — join the grouped rows to route names; null routeId →
      // "Unassigned" (matches the previous in-memory behavior).
      const routeNameById = new Map(routes.map((r) => [r.id, r.name]));
      const byRoute = byRouteRows.map((r) => {
        const total = Number(r.total);
        const delivered = Number(r.delivered);
        return {
          routeName: r.routeId ? routeNameById.get(r.routeId) ?? 'Unassigned' : 'Unassigned',
          litres: round1(Number(r.litres)),
          completionPct: total > 0 ? Math.round((delivered / total) * 100) : 0,
        };
      });

      const subscriptionCounts = {
        active: subs.find((s) => s.status === SubscriptionStatus.ACTIVE)?._count._all ?? 0,
        paused: subs.find((s) => s.status === SubscriptionStatus.PAUSED)?._count._all ?? 0,
        cancelled: subs.find((s) => s.status === SubscriptionStatus.CANCELLED)?._count._all ?? 0,
      };
      const subscriptionsTotal =
        subscriptionCounts.active + subscriptionCounts.paused + subscriptionCounts.cancelled;

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
        breakdown: { pending, missed, paused: subscriptionCounts.paused, newToday, unroutedActive },
        byRoute,
        subscriptions: { ...subscriptionCounts, total: subscriptionsTotal },
      };
    },
  });

  // PRD §7.4 — By Route: executive performance, delivery completion %, customer
  // count. One row per route with its assigned executive, assigned-customer
  // count, and delivery completion/litres over the requested range.
  app.get('/by-route', {
    handler: async (req) => {
      const { range } = Query.parse(req.query);
      const cur = currentWindow(range);
      const [routes, deliveryRows] = await Promise.all([
        prisma.route.findMany({
          include: {
            executive: { include: { user: { select: { name: true } } } },
            _count: { select: { customers: true } },
          },
          orderBy: { name: 'asc' },
        }),
        prisma.$queryRaw<
          Array<{ routeId: string | null; total: number; delivered: number; litres: number }>
        >`
          SELECT
            "routeId",
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE "status"::text IN ('DELIVERED', 'PARTIAL'))::int AS delivered,
            COALESCE(
              SUM(COALESCE("deliveredLitres", "scheduledLitres"))
                FILTER (WHERE "status"::text IN ('DELIVERED', 'PARTIAL')),
              0
            )::float8 AS litres
          FROM "Delivery"
          WHERE "scheduledFor" >= ${cur.from} AND "scheduledFor" < ${cur.to}
          GROUP BY "routeId"
        `,
      ]);
      const byId = new Map(deliveryRows.map((r) => [r.routeId ?? '', r]));
      const rows = routes.map((rt) => {
        const d = byId.get(rt.id);
        const total = d ? Number(d.total) : 0;
        const delivered = d ? Number(d.delivered) : 0;
        return {
          routeId: rt.id,
          routeName: rt.name,
          executive: rt.executive ? rt.executive.user.name : null,
          customerCount: rt._count.customers,
          scheduled: total,
          delivered,
          completionPct: total > 0 ? Math.round((delivered / total) * 100) : 0,
          litres: round1(d ? Number(d.litres) : 0),
        };
      });
      return { range, routes: rows };
    },
  });

  // PRD §7.5 — By Customer: subscription value, delivery adherence, payment
  // status. Cursor-paginated (could be thousands of customers).
  app.get('/by-customer', {
    handler: async (req) => {
      const { range } = Query.parse(req.query);
      const q = req.query as { limit?: string; cursor?: string };
      const limit = Math.min(200, Math.max(1, Number(q.limit) || 50));
      const cur = currentWindow(range);

      const customers = await prisma.customer.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        include: {
          route: { select: { name: true } },
          subscriptions: {
            where: { status: SubscriptionStatus.ACTIVE },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { litresPerDay: true, ratePerLitre: true, daysOfWeek: true },
          },
        },
      });
      const nextCursor =
        customers.length > limit ? customers[limit]?.id ?? null : null;
      const page = customers.slice(0, limit);
      const ids = page.map((c) => c.id);

      const [adherenceRows, billedRows, paidRows] = await Promise.all([
        ids.length
          ? prisma.$queryRaw<Array<{ customerId: string; total: number; delivered: number }>>`
              SELECT "customerId",
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE "status"::text IN ('DELIVERED', 'PARTIAL'))::int AS delivered
              FROM "Delivery"
              WHERE "customerId" IN (${Prisma.join(ids)})
                AND "scheduledFor" >= ${cur.from} AND "scheduledFor" < ${cur.to}
              GROUP BY "customerId"
            `
          : Promise.resolve([] as Array<{ customerId: string; total: number; delivered: number }>),
        ids.length
          ? prisma.$queryRaw<Array<{ customerId: string; billed: number }>>`
              SELECT "customerId",
                COALESCE(SUM(COALESCE("deliveredLitres", "scheduledLitres") * "ratePerLitre"), 0)::float8 AS billed
              FROM "Delivery"
              WHERE "customerId" IN (${Prisma.join(ids)})
                AND "status"::text IN ('DELIVERED', 'PARTIAL')
              GROUP BY "customerId"
            `
          : Promise.resolve([] as Array<{ customerId: string; billed: number }>),
        ids.length
          ? prisma.payment.groupBy({
              by: ['customerId'],
              where: { customerId: { in: ids }, status: 'PAID' },
              _sum: { amount: true },
            })
          : Promise.resolve([] as Array<{ customerId: string; _sum: { amount: Prisma.Decimal | null } }>),
      ]);
      const adherenceById = new Map(adherenceRows.map((r) => [r.customerId, r]));
      const billedById = new Map(billedRows.map((r) => [r.customerId, Number(r.billed)]));
      const paidById = new Map(paidRows.map((r) => [r.customerId, Number(r._sum.amount ?? 0)]));

      const rows = page.map((c) => {
        const sub = c.subscriptions[0];
        const litres = sub ? Number(sub.litresPerDay) : 0;
        const rate = sub ? Number(sub.ratePerLitre) : 0;
        const deliveriesPerWeek = sub ? (sub.daysOfWeek?.length ?? 7) : 0;
        // Monthly subscription value estimate (≈ 4.33 weeks).
        const monthlyValue = Math.round(litres * rate * deliveriesPerWeek * 4.33);
        const adh = adherenceById.get(c.id);
        const total = adh ? Number(adh.total) : 0;
        const delivered = adh ? Number(adh.delivered) : 0;
        const billed = billedById.get(c.id) ?? 0;
        const paid = paidById.get(c.id) ?? 0;
        return {
          id: c.id,
          name: c.name,
          code: c.code,
          routeName: c.route?.name ?? null,
          status: c.status,
          monthlyValue,
          adherencePct: total > 0 ? Math.round((delivered / total) * 100) : null,
          scheduled: total,
          delivered,
          outstanding: Math.round(billed - paid),
        };
      });
      return { range, customers: rows, nextCursor };
    },
  });

  // PRD §9 — success-metric instrumentation. Onboarding completion (proxy via
  // the PENDING lead state — audit ARC-08), delivery confirmation rate (last
  // 30 days), and renewal rate (RENEWED vs lapsed reminders).
  app.get('/success-metrics', {
    handler: async () => {
      const today = startOfBusinessDayUTC();
      const thirtyAgo = new Date(today.getTime() - 30 * 86_400_000);
      const [custTotal, custPending, custWithSub, delivRows, reminders] = await Promise.all([
        prisma.customer.count(),
        prisma.customer.count({ where: { status: 'PENDING' } }),
        prisma.customer.count({ where: { subscriptions: { some: {} } } }),
        prisma.$queryRaw<Array<{ total: number; delivered: number }>>`
          SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE "status"::text IN ('DELIVERED', 'PARTIAL'))::int AS delivered
          FROM "Delivery"
          WHERE "scheduledFor" >= ${thirtyAgo} AND "scheduledFor" < ${today}
        `,
        prisma.renewalReminder.groupBy({ by: ['status'], _count: { _all: true } }),
      ]);
      const d = delivRows[0] ?? { total: 0, delivered: 0 };
      const renewed = reminders.find((r) => r.status === 'RENEWED')?._count._all ?? 0;
      const lapsed = reminders.find((r) => r.status === 'CANCELLED')?._count._all ?? 0;
      const renewalResolved = renewed + lapsed;
      // "Started onboarding" ≈ customers that reached a subscription (completed)
      // + abandoned PENDING leads. Approximate: admin/bulk-created customers
      // also have subscriptions, so they count as completed.
      const startedOnboarding = custWithSub + custPending;
      return {
        onboardingCompletion: {
          rate: startedOnboarding > 0 ? Math.round((custWithSub / startedOnboarding) * 100) : 0,
          completed: custWithSub,
          pendingLeads: custPending,
          targetPct: 85,
        },
        deliveryConfirmation: {
          rate: Number(d.total) > 0 ? Math.round((Number(d.delivered) / Number(d.total)) * 100) : 0,
          delivered: Number(d.delivered),
          scheduled: Number(d.total),
          windowDays: 30,
          targetPct: 98,
        },
        renewal: {
          rate: renewalResolved > 0 ? Math.round((renewed / renewalResolved) * 100) : 0,
          renewed,
          lapsed,
          targetPct: 80,
        },
        totalCustomers: custTotal,
      };
    },
  });
}
