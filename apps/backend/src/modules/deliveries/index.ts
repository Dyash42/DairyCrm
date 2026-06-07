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
import { DeliveryStatus, PaymentMode, PaymentStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';

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
  // No early-return on `existing > 0` — see daily-route-gen.ts for why.
  // A previous partial materialization would otherwise permanently skip
  // the remaining customers. Idempotent because of the unique index on
  // (customerId, scheduledFor) + skipDuplicates.
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
  /**
   * Cash handed over by the customer at the door. Recorded as a CASH
   * Payment row and credited to Customer.balance — same effect as the
   * admin recording a payment manually, just driven by the milkman.
   */
  cashCollected: z.coerce.number().min(0).max(100000).optional(),
  note: z.string().optional(),
});

const SkipBody = z.object({
  reason: z.string().max(500).optional(),
});

const EndOfDayBody = z.object({
  /**
   * Optional sanity check from the mobile app. If the milkman's tally
   * disagrees with what we computed from confirmed deliveries we record
   * the variance instead of throwing — the admin can investigate.
   */
  reportedCashTotal: z.coerce.number().min(0).optional(),
  notes: z.string().max(2000).optional(),
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
      const body = ConfirmBody.parse(req.body);

      const delivery = await prisma.delivery.findUnique({ where: { id } });
      if (!delivery) return reply.status(404).send({ error: 'NotFound' });

      const me = req.user;
      let executiveId: string | null = null;
      if (me.role === 'EXECUTIVE') {
        const exec = await prisma.executive.findFirst({
          where: { userId: me.sub },
          select: { id: true, routeId: true },
        });
        executiveId = exec?.id ?? null;
        // Guard against cross-route confirms. A stolen QR or accidental
        // scan on another route shouldn't allow an executive to mark a
        // customer they don't deliver to. Admins (no executive row)
        // bypass this — they may confirm anyone.
        if (exec && exec.routeId !== delivery.routeId) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Delivery is on another route',
          });
        }
      }

      // Decimal-safe comparison — Number() coercion on a Prisma Decimal
      // close to scheduledLitres can mis-classify by 1e-16 rounding noise.
      const scheduled = new Prisma.Decimal(delivery.scheduledLitres);
      const actual =
        body.deliveredLitres === undefined
          ? scheduled
          : new Prisma.Decimal(body.deliveredLitres);
      const status = actual.lt(scheduled)
        ? DeliveryStatus.PARTIAL
        : DeliveryStatus.DELIVERED;

      // Atomic: stamp the delivery + (optionally) record cash payment +
      // credit Customer.balance. Either all three happen or none — we
      // never want a delivery marked DELIVERED with cash silently dropped
      // (which is what the previous code did).
      const result = await prisma.$transaction(async (tx) => {
        const updated = await tx.delivery.update({
          where: { id },
          data: {
            status,
            deliveredLitres: actual,
            scannedAt: new Date(),
            ...(body.note !== undefined ? { note: body.note } : {}),
            ...(executiveId ? { executiveId } : {}),
          },
          include: { customer: true },
        });

        if (typeof body.cashCollected === 'number' && body.cashCollected > 0) {
          await tx.payment.create({
            data: {
              customerId: updated.customerId,
              amount: body.cashCollected,
              mode: PaymentMode.CASH,
              status: PaymentStatus.PAID,
              reference: `delivery:${id}`,
              paidAt: new Date(),
            },
          });
          await tx.customer.update({
            where: { id: updated.customerId },
            data: { balance: { increment: body.cashCollected } },
          });
        }

        return updated;
      });

      return result;
    },
  });

  app.post('/:id/skip', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = SkipBody.parse(req.body);

      const delivery = await prisma.delivery.findUnique({ where: { id } });
      if (!delivery) return reply.status(404).send({ error: 'NotFound' });

      const me = req.user;
      let executiveId: string | null = null;
      if (me.role === 'EXECUTIVE') {
        const exec = await prisma.executive.findFirst({
          where: { userId: me.sub },
          select: { id: true, routeId: true },
        });
        executiveId = exec?.id ?? null;
        if (exec && exec.routeId !== delivery.routeId) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Delivery is on another route',
          });
        }
      }

      const updated = await prisma.delivery.update({
        where: { id },
        data: {
          status: DeliveryStatus.SKIPPED,
          note: body.reason ?? 'Skipped',
          ...(executiveId ? { executiveId } : {}),
        },
        include: { customer: true },
      });
      return updated;
    },
  });

  /**
   * Executive end-of-day report — closes the day for this milkman. Returns
   * the totals the admin needs: counts by status, scheduled vs delivered
   * litres, cash collected, and any variance against the milkman's tally.
   * Today this is a read-only summary endpoint (single source of truth =
   * the Delivery + Payment tables); future work can persist a snapshot
   * row for historical reporting.
   */
  app.post('/end-of-day', {
    handler: async (req, reply) => {
      const body = EndOfDayBody.parse(req.body);
      const me = req.user;
      if (me.role !== 'EXECUTIVE') {
        return reply.status(403).send({ error: 'Forbidden — executive only' });
      }
      const exec = await prisma.executive.findFirst({
        where: { userId: me.sub },
        select: { id: true, routeId: true },
      });
      if (!exec) return reply.status(404).send({ error: 'NotFound' });

      const today = startOfTodayUTC();
      const rows = await prisma.delivery.findMany({
        where: { executiveId: exec.id, scheduledFor: today },
        select: {
          id: true,
          customerId: true,
          status: true,
          scheduledLitres: true,
          deliveredLitres: true,
        },
      });

      const counts = {
        total: rows.length,
        delivered: 0,
        partial: 0,
        skipped: 0,
        pending: 0,
      };
      let scheduledLitres = new Prisma.Decimal(0);
      let deliveredLitres = new Prisma.Decimal(0);
      const customerIds = new Set<string>();
      for (const r of rows) {
        scheduledLitres = scheduledLitres.add(r.scheduledLitres);
        if (r.deliveredLitres) deliveredLitres = deliveredLitres.add(r.deliveredLitres);
        customerIds.add(r.customerId);
        if (r.status === DeliveryStatus.DELIVERED) counts.delivered += 1;
        else if (r.status === DeliveryStatus.PARTIAL) counts.partial += 1;
        else if (r.status === DeliveryStatus.SKIPPED) counts.skipped += 1;
        else counts.pending += 1;
      }

      // Cash payments tagged with this executive's deliveries today.
      const cashPayments = await prisma.payment.findMany({
        where: {
          mode: PaymentMode.CASH,
          status: PaymentStatus.PAID,
          paidAt: { gte: today },
          customerId: { in: Array.from(customerIds) },
        },
        select: { amount: true },
      });
      const cashTotal = cashPayments.reduce(
        (acc, p) => acc.add(p.amount),
        new Prisma.Decimal(0),
      );

      const variance =
        body.reportedCashTotal !== undefined
          ? new Prisma.Decimal(body.reportedCashTotal).sub(cashTotal).toNumber()
          : null;

      return reply.status(200).send({
        date: today.toISOString().slice(0, 10),
        routeId: exec.routeId,
        executiveId: exec.id,
        counts,
        litres: {
          scheduled: scheduledLitres.toNumber(),
          delivered: deliveredLitres.toNumber(),
        },
        cash: {
          collected: cashTotal.toNumber(),
          reported: body.reportedCashTotal ?? null,
          variance,
        },
        notes: body.notes ?? null,
      });
    },
  });
}
