/**
 * Payments module.
 *
 *   POST /payments/webhook    — Razorpay/Cashfree → marks Payment as PAID,
 *                               increments Customer.balance. Provider-
 *                               agnostic: uses getPaymentProvider().verify.
 *   POST /payments            — admin manually records a payment
 *                               (e.g. cash collected on a route)
 *   GET  /payments?customerId — list a customer's payments
 *
 * The webhook never trusts the client. We verify HMAC, then look up the
 * Payment row by `reference`. Idempotent: re-firing the same webhook
 * leaves the DB unchanged.
 */

import type { App } from '../../types';
import { z } from 'zod';
import { PaymentMode, PaymentStatus } from '@prisma/client';

import { prisma } from '../../prisma';
import { getPaymentProvider } from '../../providers/payment';
import { notFound } from '../../utils/http';

const RecordBody = z.object({
  customerId: z.string(),
  amount: z.coerce.number().positive(),
  mode: z.nativeEnum(PaymentMode),
  reference: z.string().optional(),
  paidAt: z.coerce.date().optional(),
});

export async function registerPaymentRoutes(app: App) {
  // Webhook is signature-verified, no JWT.
  // The rest of the module requires JWT.

  app.route({
    method: 'POST',
    url: '/webhook',
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    handler: async (req, reply) => {
      const provider = getPaymentProvider();
      const sigHeader =
        (req.headers['x-razorpay-signature'] as string | undefined) ??
        (req.headers['x-webhook-signature'] as string | undefined) ??
        '';
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

      if (!provider.verifyWebhookSignature(rawBody, sigHeader)) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const event = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Record<
        string,
        unknown
      >;

      // Extract the payment_link reference + amount in a provider-agnostic
      // way. Razorpay's "payment_link.paid" puts ref + amount under
      // `payload.payment_link.entity`. Cashfree's "PAYMENT_SUCCESS_WEBHOOK"
      // puts ref under `data.link.link_id` and amount under
      // `data.link.link_amount_paid`. We probe both.
      const razorpay = (event.payload as { payment_link?: { entity?: Record<string, unknown> } } | undefined)
        ?.payment_link?.entity;
      const cashfree = (event.data as { link?: Record<string, unknown> } | undefined)?.link;
      const reference =
        (razorpay?.id as string | undefined) ??
        (razorpay?.reference_id as string | undefined) ??
        (cashfree?.link_id as string | undefined);
      const amountPaise =
        (razorpay?.amount as number | undefined) ??
        (cashfree?.link_amount_paid as number | undefined);
      const amount = typeof amountPaise === 'number' ? amountPaise / 100 : undefined;

      if (!reference) {
        return reply.status(200).send({ ok: true, ignored: 'no reference' });
      }

      const payment = await prisma.payment.findFirst({ where: { reference } });
      if (!payment) {
        // We acknowledge but don't error — Meta-style retries will hammer
        // us; failing loudly here causes log noise without a fix.
        return reply.status(200).send({ ok: true, ignored: 'unknown reference' });
      }
      if (payment.status === PaymentStatus.PAID) {
        return reply.status(200).send({ ok: true, idempotent: true });
      }

      await prisma.$transaction(async (tx) => {
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.PAID,
            amount: amount ?? payment.amount,
            paidAt: new Date(),
          },
        });
        // Credit the customer's running balance — positive = credit.
        await tx.customer.update({
          where: { id: payment.customerId },
          data: { balance: { increment: amount ?? Number(payment.amount) } },
        });
      });

      return reply.status(200).send({ ok: true });
    },
  });

  // Authed endpoints below
  app.addHook('onRequest', app.authenticate);

  app.get('/', {
    handler: async (req) => {
      const { customerId, limit } = req.query as { customerId?: string; limit?: string };
      const take = limit ? Math.min(200, Math.max(1, Number(limit))) : 50;
      const rows = await prisma.payment.findMany({
        where: customerId ? { customerId } : {},
        orderBy: { createdAt: 'desc' },
        take,
      });
      return { payments: rows };
    },
  });

  app.post('/', {
    handler: async (req, reply) => {
      const body = RecordBody.parse(req.body);

      const customer = await prisma.customer.findUnique({ where: { id: body.customerId } });
      if (!customer) return notFound(reply, 'Customer');

      const payment = await prisma.$transaction(async (tx) => {
        const p = await tx.payment.create({
          data: {
            customerId: body.customerId,
            amount: body.amount,
            mode: body.mode,
            reference: body.reference,
            status: PaymentStatus.PAID,
            paidAt: body.paidAt ?? new Date(),
          },
        });
        await tx.customer.update({
          where: { id: body.customerId },
          data: { balance: { increment: body.amount } },
        });
        return p;
      });
      return reply.status(201).send(payment);
    },
  });
}
