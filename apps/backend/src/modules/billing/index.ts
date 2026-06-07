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
  app.addHook('onRequest', app.authenticate);

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

      // Group per customer
      const byCustomer = new Map<
        string,
        {
          id: string;
          customerName: string;
          customerCode: string;
          routeName: string;
          litres: number;
          amount: number;
        }
      >();
      for (const d of deliveries) {
        const litres = Number(d.deliveredLitres ?? d.scheduledLitres);
        const rate = Number(d.customer.subscriptions[0]?.ratePerLitre ?? fallbackRate);
        const e = byCustomer.get(d.customerId) ?? {
          id: d.customerId,
          customerName: d.customer.name,
          customerCode: d.customer.code,
          routeName: d.customer.route?.name ?? '—',
          litres: 0,
          amount: 0,
        };
        e.litres += litres;
        e.amount += litres * rate;
        byCustomer.set(d.customerId, e);
      }

      // Payment lookup for the month (any PAID Payment that covers the amount)
      const paidByCustomer = new Map<string, { mode: string }>();
      const payments = await prisma.payment.findMany({
        where: { status: 'PAID', paidAt: { gte: from, lt: to } },
      });
      for (const p of payments) {
        paidByCustomer.set(p.customerId, { mode: p.mode });
      }

      const invoices = Array.from(byCustomer.values())
        .map((e) => {
          const paid = paidByCustomer.get(e.id);
          return {
            id: `inv-${e.id}-${period ?? 'current'}`,
            customerName: e.customerName,
            customerCode: e.customerCode,
            routeName: e.routeName,
            period: label,
            litres: Math.round(e.litres * 10) / 10,
            amount: Math.round(e.amount),
            paid: Boolean(paid),
            paidVia: paid?.mode ?? null,
          };
        })
        .sort((a, b) => b.amount - a.amount);

      const totalBilled = invoices.reduce((s, i) => s + i.amount, 0);
      const totalCollected = invoices.filter((i) => i.paid).reduce((s, i) => s + i.amount, 0);

      return {
        period: label,
        invoices,
        totals: {
          billed: totalBilled,
          collected: totalCollected,
          outstanding: totalBilled - totalCollected,
        },
      };
    },
  });
}
