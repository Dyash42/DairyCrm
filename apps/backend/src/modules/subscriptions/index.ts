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

const CreateBody = z.object({
  customerId: z.string(),
  sku: z.string().default('COW_MILK'),
  litresPerDay: z.coerce.number().min(0.1).max(50),
  daysOfWeek: z.array(z.number().int().min(0).max(6)).min(1),
  ratePerLitre: z.coerce.number().min(0.01).max(10000),
  startDate: z.coerce.date(),
  durationDays: z.coerce.number().int().min(1).max(365),
});

const PauseBody = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  reason: z.string().optional(),
});

export async function registerSubscriptionRoutes(app: App) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', {
    handler: async (req) => {
      const { customerId } = req.query as { customerId?: string };
      const subs = await prisma.subscription.findMany({
        where: customerId ? { customerId } : {},
        orderBy: { createdAt: 'desc' },
      });
      return { subscriptions: subs };
    },
  });

  app.post('/', {
    handler: async (req, reply) => {
      const body = req.body as z.infer<typeof CreateBody>;
      const quote = calculateQuote({
        litresPerDay: body.litresPerDay,
        ratePerLitre: body.ratePerLitre,
        daysOfWeek: body.daysOfWeek as never,
        startDate: body.startDate,
        durationDays: body.durationDays,
      });
      const endDate = new Date(body.startDate);
      endDate.setUTCDate(endDate.getUTCDate() + body.durationDays);

      const sub = await prisma.$transaction(async (tx) => {
        const created = await tx.subscription.create({
          data: {
            customerId: body.customerId,
            sku: body.sku,
            litresPerDay: body.litresPerDay,
            daysOfWeek: body.daysOfWeek,
            ratePerLitre: body.ratePerLitre,
            startDate: body.startDate,
            endDate,
            status: SubscriptionStatus.ACTIVE,
          },
        });
        // Queue renewal reminder 3 days before endDate
        const dueDate = new Date(endDate);
        dueDate.setUTCDate(dueDate.getUTCDate() - 3);
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
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as z.infer<typeof PauseBody>;
      if (body.endDate < body.startDate) {
        return reply.status(422).send({ error: 'endDate must be ≥ startDate' });
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
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const sub = await prisma.subscription.findUnique({ where: { id } });
      if (!sub) return reply.status(404).send({ error: 'NotFound' });

      const today = new Date();
      const todayUtc = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
      );

      await prisma.$transaction(async (tx) => {
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
        await tx.subscription.update({
          where: { id },
          data: { status: SubscriptionStatus.ACTIVE },
        });
        await tx.customer.update({
          where: { id: sub.customerId },
          data: { status: CustomerStatus.ACTIVE },
        });
      });
      return { ok: true };
    },
  });

  app.post('/:id/cancel', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const sub = await prisma.subscription.findUnique({ where: { id } });
      if (!sub) return reply.status(404).send({ error: 'NotFound' });
      await prisma.subscription.update({
        where: { id },
        data: { status: SubscriptionStatus.CANCELLED },
      });
      return { ok: true };
    },
  });

  /** Pure preview of the ₹ math — no DB writes. Used by admin "new sub" modal. */
  app.post('/quote', {
    handler: async (req) => {
      const body = req.body as {
        litresPerDay: number;
        ratePerLitre: number;
        daysOfWeek: number[];
        durationDays: number;
        startDate: Date;
      };
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
