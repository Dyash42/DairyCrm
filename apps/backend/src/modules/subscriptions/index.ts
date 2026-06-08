/**
 * Subscriptions module.
 *
 * GET    /subscriptions?customerId=...
 * POST   /subscriptions                  — create + auto-create RenewalReminder
 * PATCH  /subscriptions/:id              — update mutable fields
 * POST   /subscriptions/:id/pause        — start pause (creates PauseRecord + AutoResumeJob)
 * POST   /subscriptions/:id/resume       — end pause early
 * POST   /subscriptions/:id/cancel
 */

import type { App } from '../../types';
import { z } from 'zod';
import {
  AutoResumeStatus,
  CustomerStatus,
  RenewalReminderStatus,
  SubscriptionStatus,
} from '@prisma/client';

import { prisma } from '../../prisma';
import { calculateQuote, DAYS_OF_WEEK } from '../../services/subscription-calc';
import { settings } from '../../services/settings';

const CreateBody = z.object({
  customerId: z.string(),
  /** New: pick by product id; we look up rate from the Product row. */
  productId: z.string().optional(),
  /** Legacy: SKU string. Kept for back-compat. */
  sku: z.string().default('COW_MILK'),
  litresPerDay: z.coerce.number().min(0.1).max(50),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
  /** Optional override — admin-only "special rate" customers. If omitted,
   *  the Product's current ratePerUnit is used (cached on the row). */
  ratePerLitre: z.coerce.number().min(0.01).max(10000).optional(),
  startDate: z.coerce.date(),
  /** Optional — falls back to subscription.default_duration_days setting. */
  durationDays: z.coerce.number().int().min(1).max(365).optional(),
});

const PauseBody = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().optional(),
});

export async function registerSubscriptionRoutes(app: App) {
  // Subscriptions are admin-managed. All mutating endpoints (create,
  // pause, resume, cancel) require ADMIN. List requires either ADMIN or
  // a customerId scoped to the executive's own route — without this an
  // executive could enumerate every customer's subscription terms
  // (rate, days, end-date), which the bug audit flagged as PII leak.
  app.addHook('onRequest', app.authenticate);
  const adminOnly = app.requireRole('ADMIN');

  app.get('/', {
    handler: async (req, reply) => {
      const { customerId } = req.query as { customerId?: string };
      const me = req.user;
      // ADMIN can list anyone; EXECUTIVE must supply a customerId AND
      // that customer must be on their assigned route.
      if (me.role === 'EXECUTIVE') {
        if (!customerId) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Executives must specify customerId',
          });
        }
        const exec = await prisma.executive.findFirst({
          where: { userId: me.sub },
          select: { routeId: true },
        });
        const customer = await prisma.customer.findUnique({
          where: { id: customerId },
          select: { routeId: true },
        });
        if (!exec?.routeId || customer?.routeId !== exec.routeId) {
          return reply.status(403).send({ error: 'Forbidden' });
        }
      }
      const subs = await prisma.subscription.findMany({
        where: customerId ? { customerId } : {},
        orderBy: { createdAt: 'desc' },
      });
      return { subscriptions: subs };
    },
  });

  app.post('/', {
    preHandler: adminOnly,
    handler: async (req, reply) => {
      const body = CreateBody.parse(req.body);

      // Resolve rate + sku from Product if productId given
      let productId: string | null = body.productId ?? null;
      let sku = body.sku;
      let rate = body.ratePerLitre;
      if (productId) {
        const product = await prisma.product.findUnique({ where: { id: productId } });
        if (!product) {
          return reply.status(422).send({ error: 'Unknown productId' });
        }
        sku = product.code;
        rate = rate ?? Number(product.ratePerUnit);
      }
      if (rate === undefined || rate <= 0) {
        return reply.status(422).send({ error: 'ratePerLitre or productId required' });
      }

      // Defaults sourced from Settings (admin-editable)
      const durationDays =
        body.durationDays ??
        (await settings.getNumber('subscription.default_duration_days', 30));
      const renewalLeadDays = await settings.getNumber(
        'subscription.renewal_reminder_days_before',
        3,
      );

      const quote = calculateQuote({
        litresPerDay: body.litresPerDay,
        ratePerLitre: rate,
        daysOfWeek: body.daysOfWeek as never,
        startDate: body.startDate,
        durationDays,
      });
      const endDate = new Date(body.startDate);
      endDate.setUTCDate(endDate.getUTCDate() + durationDays);

      const sub = await prisma.$transaction(async (tx) => {
        const created = await tx.subscription.create({
          data: {
            customerId: body.customerId,
            productId,
            sku,
            litresPerDay: body.litresPerDay,
            daysOfWeek: body.daysOfWeek,
            ratePerLitre: rate,
            startDate: body.startDate,
            endDate,
            status: SubscriptionStatus.ACTIVE,
          },
        });
        const dueDate = new Date(endDate);
        dueDate.setUTCDate(dueDate.getUTCDate() - renewalLeadDays);
        await tx.renewalReminder.create({
          data: {
            subscriptionId: created.id,
            customerId: body.customerId,
            dueDate,
            status: RenewalReminderStatus.PENDING,
          },
        });
        await tx.customer.update({
          where: { id: body.customerId },
          data: { litresPerDay: body.litresPerDay, status: CustomerStatus.ACTIVE },
        });
        return created;
      });
      return reply.status(201).send({ subscription: sub, quote });
    },
  });

  app.post('/:id/pause', {
    preHandler: adminOnly,
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = PauseBody.parse(req.body);
      if (body.endDate < body.startDate) {
        return reply.status(422).send({ error: 'endDate must be ≥ startDate' });
      }

      // Admin-configurable cap on pause length
      const maxPauseDays = await settings.getNumber('pause.max_days', 60);
      const requestedDays =
        Math.round((body.endDate.getTime() - body.startDate.getTime()) / 86_400_000) + 1;
      if (requestedDays > maxPauseDays) {
        return reply
          .status(422)
          .send({ error: `Pause cannot exceed ${maxPauseDays} days (requested ${requestedDays}).` });
      }

      const sub = await prisma.subscription.findUnique({ where: { id } });
      if (!sub) return reply.status(404).send({ error: 'NotFound' });

      const resumeDate = new Date(body.endDate);
      resumeDate.setUTCDate(resumeDate.getUTCDate() + 1);

      const result = await prisma.$transaction(async (tx) => {
        const pause = await tx.pauseRecord.create({
          data: {
            subscriptionId: id,
            customerId: sub.customerId,
            startDate: body.startDate,
            endDate: body.endDate,
            resumeDate,
            reason: body.reason,
          },
        });
        await tx.autoResumeJob.create({
          data: {
            pauseRecordId: pause.id,
            scheduledFor: resumeDate,
            status: AutoResumeStatus.PENDING,
          },
        });
        await tx.subscription.update({
          where: { id },
          data: { status: SubscriptionStatus.PAUSED },
        });
        await tx.customer.update({
          where: { id: sub.customerId },
          data: { status: CustomerStatus.PAUSED },
        });
        return pause;
      });
      return reply.status(201).send(result);
    },
  });

  app.post('/:id/resume', {
    preHandler: adminOnly,
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const sub = await prisma.subscription.findUnique({ where: { id } });
      if (!sub) return reply.status(404).send({ error: 'NotFound' });

      // Only a PAUSED subscription can be resumed. Without this check a
      // curl/admin-bug could resurrect a CANCELLED sub silently, causing
      // deliveries to a churned customer and re-billing them.
      if (sub.status !== SubscriptionStatus.PAUSED) {
        return reply.status(409).send({
          error: 'NotPaused',
          message: `Subscription is currently ${sub.status}; only PAUSED subs can be resumed.`,
        });
      }

      const today = new Date();
      const todayUtc = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
      );

      // Compare-and-swap the status inside the transaction. If a concurrent
      // resume races, only one updateMany returns count===1; the other
      // aborts with a 409 and the customer table isn't touched twice.
      const result = await prisma.$transaction(async (tx) => {
        const flipped = await tx.subscription.updateMany({
          where: { id, status: SubscriptionStatus.PAUSED },
          data: { status: SubscriptionStatus.ACTIVE },
        });
        if (flipped.count !== 1) {
          return { ok: false as const };
        }
        // End any open pause: set endDate=today so future days resume
        await tx.pauseRecord.updateMany({
          where: { subscriptionId: id, endDate: { gte: todayUtc } },
          data: { endDate: todayUtc, resumeDate: new Date(todayUtc.getTime() + 86400000) },
        });
        await tx.autoResumeJob.updateMany({
          where: {
            pauseRecord: { subscriptionId: id },
            status: AutoResumeStatus.PENDING,
          },
          data: { status: AutoResumeStatus.RESUMED, resumedAt: new Date() },
        });
        await tx.customer.update({
          where: { id: sub.customerId },
          data: { status: CustomerStatus.ACTIVE },
        });
        return { ok: true as const };
      });
      if (!result.ok) {
        return reply.status(409).send({ error: 'Concurrent state change' });
      }
      return { ok: true };
    },
  });

  app.post('/:id/cancel', {
    preHandler: adminOnly,
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const sub = await prisma.subscription.findUnique({ where: { id } });
      if (!sub) return reply.status(404).send({ error: 'NotFound' });
      if (sub.status === SubscriptionStatus.CANCELLED) {
        return { ok: true, idempotent: true };
      }
      await prisma.subscription.update({
        where: { id },
        data: { status: SubscriptionStatus.CANCELLED },
      });
      return { ok: true };
    },
  });

  /** Pure preview of the ₹ math — no DB writes. Used by admin "new sub" modal. */
  const QuoteBody = z.object({
    litresPerDay: z.coerce.number().min(0.1).max(50),
    ratePerLitre: z.coerce.number().min(0.01).max(10000),
    daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
    durationDays: z.coerce.number().int().min(1).max(365),
    startDate: z.coerce.date(),
  });
  app.post('/quote', {
    preHandler: adminOnly,
    handler: async (req) => {
      const body = QuoteBody.parse(req.body);
      return calculateQuote({
        litresPerDay: body.litresPerDay,
        ratePerLitre: body.ratePerLitre,
        daysOfWeek: body.daysOfWeek as never,
        startDate: body.startDate,
        durationDays: body.durationDays,
      });
    },
  });
}

// Keep DAYS_OF_WEEK exported for clients
export { DAYS_OF_WEEK };
