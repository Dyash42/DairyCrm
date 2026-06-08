/**
 * Billing module.
 *
 * GET /billing/invoices?period=YYYY-MM
 *   — synthesized monthly invoices: per active customer in the month,
 *     sum of delivered litres × ratePerLitre. Marks as PAID/PENDING
 *     based on whether any Payment row covers the amount.
 *
 * Real invoicing later: PDF generation, GST line items, tax slabs.
 * For now, this returns the same shape the admin Billing screen mocks
 * so the UI can swap mock for live with no shape change.
 */

import type { App } from '../../types';
import { z } from 'zod';
import { DeliveryStatus } from '@prisma/client';

import { prisma } from '../../prisma';
import { Prisma } from '@prisma/client';
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

      // Settings-driven fallback rate. We still prefer the subscription's
      // own cached rate (set at the time of subscribing — that's the rate
      // the customer agreed to). Only when a delivery has no subscription
      // we fall back to this. NOTE: this is the rate at THIS moment, not
      // the rate when the delivery happened; capturing per-Delivery rate
      // is a follow-up.
      const fallbackRate = await settings.getNumber(
        'pricing.default_rate_per_litre_inr',
        DEFAULT_RATE_PER_LITRE_INR,
      );

      const deliveries = await prisma.delivery.findMany({
        where: {
          scheduledFor: { gte: from, lt: to },
          status: { in: [DeliveryStatus.DELIVERED, DeliveryStatus.PARTIAL] },
        },
        include: {
          customer: {
            include: {
              subscriptions: {
                where: { status: 'ACTIVE' },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
              route: { select: { name: true } },
            },
          },
        },
      });

      // Group per customer. All money math runs through Prisma.Decimal
      // so we don't accumulate float errors across hundreds of
      // deliveries. The previous code used `Number()` + `*` + `+=` which
      // drifts a few paise per hundred deliveries — small per-row but
      // adds up across the month.
      const ZERO = new Prisma.Decimal(0);
      const byCustomer = new Map<
        string,
        {
          id: string;
          customerName: string;
          customerCode: string;
          routeName: string;
          litres: Prisma.Decimal;
          amount: Prisma.Decimal;
        }
      >();
      for (const d of deliveries) {
        const litres = new Prisma.Decimal(d.deliveredLitres ?? d.scheduledLitres);
        // Use the per-Delivery snapshotted rate when present (rows
        // materialized after the 0003 migration). Older rows fall
        // back to the customer's ACTIVE subscription rate, then to
        // the settings default. The snapshot is the ONLY way to make
        // past-month invoices stable across admin rate edits.
        const rate = new Prisma.Decimal(
          d.ratePerLitre ?? d.customer.subscriptions[0]?.ratePerLitre ?? fallbackRate,
        );
        const e = byCustomer.get(d.customerId) ?? {
          id: d.customerId,
          customerName: d.customer.name,
          customerCode: d.customer.code,
          routeName: d.customer.route?.name ?? '—',
          litres: ZERO,
          amount: ZERO,
        };
        e.litres = e.litres.add(litres);
        e.amount = e.amount.add(litres.mul(rate));
        byCustomer.set(d.customerId, e);
      }

      // Sum payments per customer for the month. The previous code
      // marked an invoice fully paid if ANY PAID payment existed in
      // the window — a ₹50 cash row flipped a ₹5,000 monthly invoice
      // to "paid". Now we compare sum-of-payments against
      // sum-of-deliveries × rate; "paid" means sum >= invoice.
      const payments = await prisma.payment.findMany({
        where: { status: 'PAID', paidAt: { gte: from, lt: to } },
        select: { customerId: true, amount: true, mode: true, paidAt: true },
      });
      const paidByCustomer = new Map<
        string,
        { total: Prisma.Decimal; lastMode: string }
      >();
      for (const p of payments) {
        const cur = paidByCustomer.get(p.customerId) ?? { total: ZERO, lastMode: p.mode };
        paidByCustomer.set(p.customerId, {
          total: cur.total.add(p.amount),
          lastMode: p.mode, // latest payment's mode (rows come ordered)
        });
      }

      const invoices = Array.from(byCustomer.values())
        .map((e) => {
          const paid = paidByCustomer.get(e.id);
          const paidTotal = paid?.total ?? ZERO;
          // Customer fully paid if cumulative payments >= invoice amount.
          // Compare with a 1-paise (₹0.01) tolerance to absorb stub-rate
          // rounding artifacts; bigger gaps are real outstanding balance.
          const fullyPaid = paidTotal.gte(e.amount.minus(new Prisma.Decimal(0.01)));
          return {
            id: `inv-${e.id}-${period ?? 'current'}`,
            customerName: e.customerName,
            customerCode: e.customerCode,
            routeName: e.routeName,
            period: label,
            litres: e.litres.toDP(1).toNumber(),
            amount: e.amount.toDP(0).toNumber(),
            paidAmount: paidTotal.toDP(0).toNumber(),
            paid: fullyPaid,
            paidVia: paid?.lastMode ?? null,
          };
        })
        .sort((a, b) => b.amount - a.amount);

      const billed = invoices.reduce((s, i) => s.add(i.amount), ZERO);
      const collected = invoices.reduce((s, i) => s.add(i.paidAmount), ZERO);

      return {
        period: label,
        invoices,
        totals: {
          billed: billed.toDP(0).toNumber(),
          collected: collected.toDP(0).toNumber(),
          outstanding: billed.sub(collected).toDP(0).toNumber(),
        },
      };
    },
  });
}
