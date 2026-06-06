/**
 * Deliveries module.
 *
 * The milkman's app calls:
 *   GET   /deliveries/today                 — today's route for the logged-in executive
 *   GET   /deliveries/route/:routeId/today  — today's deliveries on a route (admin)
 *   POST  /deliveries/:id/confirm           — mark delivered (qty optional → partial)
 *   POST  /deliveries/:id/skip              — skip (customer not home)
 *
 * On-demand: if no Delivery rows exist for today, we lazily materialize them
 * from the scheduling engine (so admin doesn't have to run a cron in dev).
 */

import type { App } from '../../types';
import { z } from 'zod';
import { DeliveryStatus } from '@prisma/client';

import { prisma } from '../../prisma';
import { getDeliveriesForDate, type ScheduleRepo } from '../../services/scheduling';

function buildScheduleRepo(): ScheduleRepo {
  return {
    async listSubscriptionsActiveOn() {
      const rows = await prisma.subscription.findMany({
        where: { status: 'ACTIVE' },
        include: { customer: true },
      });
      return rows.map((s) => ({
        id: s.id,
        customerId: s.customerId,
        routeId: s.customer.routeId,
        litresPerDay: Number(s.litresPerDay),
        daysOfWeek: s.daysOfWeek,
        startDate: s.startDate,
        endDate: s.endDate,
        status: s.status,
      }));
    },
    async listPausesOverlapping(date) {
      return prisma.pauseRecord.findMany({
        where: {
          startDate: { lte: date },
          endDate: { gte: date },
        },
        select: { subscriptionId: true, startDate: true, endDate: true },
      });
    },
    async isHoliday(date, routeId) {
      const row = await prisma.holidayCalendar.findFirst({
        where: {
          date,
          OR: [{ scope: 'ALL' }, ...(routeId ? [{ scope: routeId }] : [])],
        },
      });
      return row !== null;
    },
  };
}

async function materializeTodaysDeliveries(today: Date) {
  const existing = await prisma.delivery.count({ where: { scheduledFor: today } });
  if (existing > 0) return;

  const planned = await getDeliveriesForDate(today, buildScheduleRepo());
  if (planned.length === 0) return;

  // Skip planned entries without a route — they can't be assigned to an executive
  await prisma.delivery.createMany({
    data: planned
      .filter((p) => p.routeId !== null)
      .map((p) => ({
        customerId: p.customerId,
        routeId: p.routeId as string,
        scheduledLitres: p.litres,
        scheduledFor: p.date,
        status: DeliveryStatus.PENDING,
      })),
    skipDuplicates: true,
  });
}

function startOfTodayUTC(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

const ConfirmBody = z.object({
  deliveredLitres: z.coerce.number().min(0).max(50).optional(),
  note: z.string().optional(),
});

export async function registerDeliveryRoutes(app: App) {
  app.addHook('onRequest', app.authenticate);

  app.get('/today', {
    handler: async (req, reply) => {
      const today = startOfTodayUTC();
      await materializeTodaysDeliveries(today);

      // Logged-in user — if EXECUTIVE, scope to their route; if ADMIN, return all.
      const me = req.user;
      let routeId: string | null = null;
      if (me.role === 'EXECUTIVE') {
        const exec = await prisma.executive.findFirst({
          where: { userId: me.sub },
          select: { routeId: true },
        });
        if (!exec?.routeId) {
          return { date: today.toISOString(), routeId: null, deliveries: [] };
        }
        routeId = exec.routeId;
      }

      const where: Record<string, unknown> = { scheduledFor: today };
      if (routeId) where.routeId = routeId;

      const deliveries = await prisma.delivery.findMany({
        where,
        include: {
          customer: {
            select: {
              id: true,
              code: true,
              name: true,
              addressLine1: true,
              routeSeq: true,
            },
          },
        },
        orderBy: { customer: { routeSeq: 'asc' } },
      });
      return { date: today.toISOString(), routeId, deliveries };
    },
  });

  app.get('/route/:routeId/today', {
    handler: async (req) => {
      const { routeId } = req.params as { routeId: string };
      const today = startOfTodayUTC();
      await materializeTodaysDeliveries(today);

      const deliveries = await prisma.delivery.findMany({
        where: { routeId, scheduledFor: today },
        include: { customer: true },
        orderBy: { customer: { routeSeq: 'asc' } },
      });
      return { date: today.toISOString(), routeId, deliveries };
    },
  });

  app.post('/:id/confirm', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const { deliveredLitres, note } = req.body as z.infer<typeof ConfirmBody>;

      const delivery = await prisma.delivery.findUnique({ where: { id } });
      if (!delivery) return reply.status(404).send({ error: 'NotFound' });

      const actualLitres = deliveredLitres ?? Number(delivery.scheduledLitres);
      const status =
        actualLitres < Number(delivery.scheduledLitres)
          ? DeliveryStatus.PARTIAL
          : DeliveryStatus.DELIVERED;

      // If executive making this call, attach their id
      const me = req.user;
      let executiveId: string | null = null;
      if (me.role === 'EXECUTIVE') {
        const exec = await prisma.executive.findFirst({ where: { userId: me.sub } });
        executiveId = exec?.id ?? null;
      }

      const updated = await prisma.delivery.update({
        where: { id },
        data: {
          status,
          deliveredLitres: actualLitres,
          scannedAt: new Date(),
          note: note ?? delivery.note,
          ...(executiveId ? { executiveId } : {}),
        },
        include: { customer: true },
      });
      return updated;
    },
  });

  app.post('/:id/skip', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const { reason } = req.body as { reason?: string };
      const updated = await prisma.delivery
        .update({
          where: { id },
          data: { status: DeliveryStatus.SKIPPED, note: reason ?? 'Skipped' },
        })
        .catch(() => null);
      if (!updated) return reply.status(404).send({ error: 'NotFound' });
      return updated;
    },
  });
}
