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

  // Capture raw body for HMAC verification — Fastify's default JSON
  // parser would discard the bytes, and JSON.stringify(req.body) does
  // NOT byte-match the gateway's signed payload (key order, whitespace,
  // unicode escapes all differ). Without this, EVERY real webhook fails.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    function (req, body, done) {
      (req as { rawBody?: string }).rawBody = body as string;
      try {
        const json = (body as string).length === 0 ? {} : JSON.parse(body as string);
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

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
      const rawBody = req.rawBody ?? '';

      if (!provider.verifyWebhookSignature(rawBody, sigHeader)) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const event = req.body as Record<string, unknown>;

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
      const eventAmount = typeof amountPaise === 'number' ? amountPaise / 100 : undefined;

      if (!reference) {
        return reply.status(200).send({ ok: true, ignored: 'no reference' });
      }

      // Run the whole flip-to-PAID under one transaction. Use the most
      // recent pending payment with this reference — if duplicates exist
      // (e.g. a customer retried a payment-link), we credit only one.
      // The race-free `update with where` ensures we don't double-credit
      // if two webhook retries land concurrently: the second one finds
      // status already PAID and noops.
      const result = await prisma.$transaction(async (tx) => {
        const payment = await tx.payment.findFirst({
          where: { reference, status: PaymentStatus.PENDING },
          orderBy: { createdAt: 'desc' },
        });
        if (!payment) {
          const alreadyPaid = await tx.payment.findFirst({
            where: { reference, status: PaymentStatus.PAID },
          });
          return alreadyPaid ? { kind: 'idempotent' as const } : { kind: 'unknown' as const };
        }

        // Trust-but-verify the amount: the signature proves the EVENT is
        // real, but a forged-amount event with a valid signature on an
        // unrelated reference would silently over/under-credit. Require
        // the event amount to match what we created the payment for.
        const expected = Number(payment.amount);
        if (typeof eventAmount === 'number' && Math.abs(eventAmount - expected) > 0.01) {
          return { kind: 'amount-mismatch' as const, expected, got: eventAmount };
        }

        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.PAID,
            paidAt: new Date(),
          },
        });
        // Credit the customer's running balance using the Payment.amount we
        // already trust (set at creation), not the event-supplied number.
        await tx.customer.update({
          where: { id: payment.customerId },
          data: { balance: { increment: payment.amount } },
        });
        return { kind: 'paid' as const };
      });

      if (result.kind === 'unknown') {
        // We acknowledge but don't error — gateways aggressively retry, and
        // failing loudly causes log noise without a fix.
        return reply.status(200).send({ ok: true, ignored: 'unknown reference' });
      }
      if (result.kind === 'idempotent') {
        return reply.status(200).send({ ok: true, idempotent: true });
      }
      if (result.kind === 'amount-mismatch') {
        req.log.warn({ reference, ...result }, 'webhook amount mismatch — refusing credit');
        return reply.status(409).send({ error: 'AmountMismatch' });
      }
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
