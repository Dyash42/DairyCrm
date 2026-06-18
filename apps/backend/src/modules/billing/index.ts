/**
 * Billing module.
 *
 * GET /billing/invoices?period=YYYY-MM
 *   — synthesized monthly invoices: per active customer in the month,
 *     sum of delivered litres × ratePerLitre. Marks as PAID/PENDING
 *     based on whether payments cover the amount.
 *
 * Real invoicing later: PDF generation, GST line items, tax slabs.
 * For now, this returns the same shape the admin Billing screen mocks
 * so the UI can swap mock for live with no shape change.
 *
 * PER-04: the per-customer aggregation runs in SQL (Postgres `numeric`
 * SUM is exact, so the result is at least as precise as the old
 * Prisma.Decimal accumulation, and we no longer `findMany` every
 * delivered row + its customer/subscription includes into memory — at
 * 1k subscribers that was ~25k rows with joins on every Billing load).
 * The per-Delivery snapshot rate is preferred, then the customer's
 * ACTIVE subscription rate, then the settings default — same COALESCE
 * chain as before, expressed in the query.
 */

import type { App } from '../../types';
import { z } from 'zod';

import { prisma } from '../../prisma';
import { DEFAULT_RATE_PER_LITRE_INR } from '../../constants';
import { settings } from '../../services/settings';

const ListQuery = z.object({
  period: z.string().regex(/^\d{4}-\d{2}$/).optional(),
});

function monthBounds(periodYM?: string): { from: Date; to: Date; label: string } {
  let year: number;
  let month: number;
  if (periodYM) {
    const [yRaw, mRaw] = periodYM.split('-').map(Number);
    if (Number.isInteger(yRaw) && Number.isInteger(mRaw) && (mRaw as number) >= 1 && (mRaw as number) <= 12) {
      year = yRaw as number;
      month = (mRaw as number) - 1;
    } else {
      const d = new Date();
      year = d.getUTCFullYear();
      month = d.getUTCMonth();
    }
  } else {
    const d = new Date();
    year = d.getUTCFullYear();
    month = d.getUTCMonth();
  }
  const from = new Date(Date.UTC(year, month, 1));
  const to = new Date(Date.UTC(year, month + 1, 1));
  const label = from.toLocaleString('en-US', { month: 'long', year: 'numeric' });
  return { from, to, label };
}

export async function registerBillingRoutes(app: App) {
  // Admin-only — invoices are financial PII (per-customer ₹ owed +
  // paid status). The previous auth-only hook let any EXECUTIVE pull
  // them via the bearer token from their mobile app.
  app.addHook('onRequest', app.authenticate);
  app.addHook('onRequest', app.requireRole('ADMIN'));

  app.get('/invoices', {
    handler: async (req) => {
      const { period } = ListQuery.parse(req.query);
      const { from, to, label } = monthBounds(period);

      // Settings-driven fallback rate — used only when a delivery has neither
      // its own snapshot rate nor an ACTIVE-subscription rate. NOTE: this is
      // the rate at THIS moment, not when the delivery happened; the
      // per-Delivery snapshot (preferred below) is what keeps past-month
      // invoices stable across admin rate edits.
      const fallbackRate = await settings.getNumber(
        'pricing.default_rate_per_litre_inr',
        DEFAULT_RATE_PER_LITRE_INR,
      );

      // Per-customer billed litres + amount, aggregated in SQL. The rate is
      // COALESCE(delivery snapshot, customer's latest ACTIVE sub, settings
      // default) — the same precedence the in-memory version used. Postgres
      // `numeric` keeps the running sum exact; we cast the final value to
      // float8 once for transport.
      const billedRows = await prisma.$queryRaw<
        Array<{
          id: string;
          customerName: string;
          customerCode: string;
          routeName: string;
          litres: number;
          amount: number;
        }>
      >`
        SELECT
          d."customerId" AS id,
          c."name" AS "customerName",
          c."code" AS "customerCode",
          COALESCE(r."name", '—') AS "routeName",
          SUM(COALESCE(d."deliveredLitres", d."scheduledLitres"))::float8 AS litres,
          SUM(
            COALESCE(d."deliveredLitres", d."scheduledLitres")
            * COALESCE(d."ratePerLitre", s."ratePerLitre", ${fallbackRate})
          )::float8 AS amount
        FROM "Delivery" d
        JOIN "Customer" c ON c."id" = d."customerId"
        LEFT JOIN "Route" r ON r."id" = c."routeId"
        LEFT JOIN LATERAL (
          SELECT "ratePerLitre"
          FROM "Subscription"
          WHERE "customerId" = d."customerId" AND "status"::text = 'ACTIVE'
          ORDER BY "createdAt" DESC
          LIMIT 1
        ) s ON true
        WHERE d."scheduledFor" >= ${from} AND d."scheduledFor" < ${to}
          AND d."status"::text IN ('DELIVERED', 'PARTIAL')
        GROUP BY d."customerId", c."name", c."code", r."name"
      `;

      // Payments per customer for the window: cumulative total + the most
      // recent payment's mode (the previous code's "last mode" was whatever
      // order findMany happened to return; ordering by paidAt is at least
      // deterministic).
      const paidRows = await prisma.$queryRaw<
        Array<{ id: string; total: number; lastMode: string }>
      >`
        SELECT
          "customerId" AS id,
          SUM("amount")::float8 AS total,
          (ARRAY_AGG("mode"::text ORDER BY COALESCE("paidAt", "createdAt") DESC))[1] AS "lastMode"
        FROM "Payment"
        WHERE "status"::text = 'PAID' AND "paidAt" >= ${from} AND "paidAt" < ${to}
        GROUP BY "customerId"
      `;
      const paidByCustomer = new Map(
        paidRows.map((p) => [p.id, { total: Number(p.total), lastMode: p.lastMode }]),
      );

      const invoices = billedRows
        .map((e) => {
          const amount = Number(e.amount);
          const paid = paidByCustomer.get(e.id);
          const paidTotal = paid?.total ?? 0;
          // Fully paid if cumulative payments >= invoice amount, within a
          // 1-paise tolerance to absorb stub-rate rounding artifacts.
          const fullyPaid = paidTotal >= amount - 0.01;
          return {
            id: `inv-${e.id}-${period ?? 'current'}`,
            customerName: e.customerName,
            customerCode: e.customerCode,
            routeName: e.routeName,
            period: label,
            litres: Math.round(Number(e.litres) * 10) / 10,
            amount: Math.round(amount),
            paidAmount: Math.round(paidTotal),
            paid: fullyPaid,
            paidVia: paid?.lastMode ?? null,
          };
        })
        .sort((a, b) => b.amount - a.amount);

      const billed = invoices.reduce((s, i) => s + i.amount, 0);
      const collected = invoices.reduce((s, i) => s + i.paidAmount, 0);

      return {
        period: label,
        invoices,
        totals: {
          billed: Math.round(billed),
          collected: Math.round(collected),
          outstanding: Math.round(billed - collected),
        },
      };
    },
  });
}
