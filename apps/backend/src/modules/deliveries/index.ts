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
import { getDeliveriesForDate } from '../../services/scheduling';
import { buildScheduleRepo } from '../../services/schedule-repo';
import { startOfBusinessDayUTC } from '../../utils/dates';

/**
 * Run the (expensive) full materialization only when today has no Delivery
 * rows yet. The daily-route-gen cron owns generation; the read path is just a
 * dev/empty-day fallback. Previously every GET re-scanned all active
 * subscriptions + ran the holiday lookup, stampeding the DB during the
 * morning login rush (audit PER-02/ARC-02).
 */
async function materializeIfEmpty(today: Date): Promise<void> {
  const existing = await prisma.delivery.count({ where: { scheduledFor: today } });
  if (existing === 0) await materializeTodaysDeliveries(today);
}

async function materializeTodaysDeliveries(today: Date) {
  // No early-return on `existing > 0` — see daily-route-gen.ts for why.
  // A previous partial materialization would otherwise permanently skip
  // the remaining customers. Idempotent because of the unique index on
  // (customerId, productId, scheduledFor) + skipDuplicates.
  const planned = await getDeliveriesForDate(today, buildScheduleRepo());
  if (planned.length === 0) return;

  // Skip planned entries without a route — they can't be assigned to an executive
  await prisma.delivery.createMany({
    data: planned
      .filter((p) => p.routeId !== null)
      .map((p) => ({
        customerId: p.customerId,
        subscriptionId: p.subscriptionId,
        productId: p.productId,
        routeId: p.routeId as string,
        scheduledLitres: p.litres,
        // Snapshot rate at materialization — historical billing reads
        // delivery.ratePerLitre rather than re-querying the current
        // subscription, so admin rate edits don't rewrite past invoices.
        ratePerLitre: p.ratePerLitre,
        scheduledFor: p.date,
        status: DeliveryStatus.PENDING,
      })),
    skipDuplicates: true,
  });
}

// "today" is always the business-TZ-anchored UTC midnight. The previous
// startOfTodayUTC() was off by ~5h30m which caused early-morning (IST)
// invocations to materialize against yesterday's date.
const startOfTodayUTC = startOfBusinessDayUTC;

// PER-09: stable route-sequence comparator. Customers without a routeSeq sort
// last (a milkman orders by their walking sequence; unsequenced stops trail).
function byRouteSeq(
  a: { customer: { routeSeq: number | null } },
  b: { customer: { routeSeq: number | null } },
): number {
  const sa = a.customer.routeSeq ?? Number.MAX_SAFE_INTEGER;
  const sb = b.customer.routeSeq ?? Number.MAX_SAFE_INTEGER;
  return sa - sb;
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

// MOB-05: a same-day correction of an already-confirmed/skipped stop. Lets the
// field agent fix a fat-fingered quantity or an accidental skip/cash entry
// without admin DB surgery. Reconciles the door-cash Payment so balance + EOD
// stay correct, and stamps an audit note on the delivery.
const CorrectBody = z.object({
  deliveredLitres: z.coerce.number().min(0).max(50).optional(),
  /** true → mark the stop SKIPPED (not delivered). */
  skip: z.boolean().optional(),
  /** Corrected cash collected at the door (replaces any prior door cash). */
  cashCollected: z.coerce.number().min(0).max(100000).optional(),
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
      await materializeIfEmpty(today);

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

      // PER-09: filter is index-backed (@@index([routeId, scheduledFor])), but
      // ordering by the JOINED customer.routeSeq has no index and forces a
      // relational in-memory sort in Postgres on every call. A single route's
      // day is bounded (tens–hundreds of stops), so sort the small result set
      // in JS instead — the DB does only the indexed filter.
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
              lat: true,
              lng: true,
            },
          },
          product: { select: { name: true } },
        },
      });
      deliveries.sort(byRouteSeq);
      return { date: today.toISOString(), routeId, deliveries };
    },
  });

  app.get('/route/:routeId/today', {
    handler: async (req, reply) => {
      const { routeId } = req.params as { routeId: string };
      const me = req.user;

      // Cross-route PII guard. The previous code returned full customer
      // rows (name, phone, altPhone, address, balance, ...) for any
      // route the caller asked about — an executive could iterate
      // routeIds and dump every customer's data. Now: an EXECUTIVE
      // gets 403 unless the requested routeId is their assigned route.
      if (me.role === 'EXECUTIVE') {
        const exec = await prisma.executive.findFirst({
          where: { userId: me.sub },
          select: { routeId: true },
        });
        if (!exec || exec.routeId !== routeId) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Executive can only query their own route',
          });
        }
      }

      const today = startOfTodayUTC();
      await materializeIfEmpty(today);

      // Narrow include to the fields the mobile UI actually consumes —
      // full Customer was overkill and shipped balance/email/altPhone
      // that the mobile screen never displayed.
      const deliveries = await prisma.delivery.findMany({
        where: { routeId, scheduledFor: today },
        include: {
          customer: {
            select: {
              id: true,
              code: true,
              name: true,
              addressLine1: true,
              routeSeq: true,
              litresPerDay: true,
              lat: true,
              lng: true,
            },
          },
          product: { select: { name: true } },
        },
      });
      deliveries.sort(byRouteSeq); // PER-09: index-backed filter, JS sort
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
      // Route-ownership constraint for executives. Folded INTO the atomic
      // claim below (not checked in a separate read) so the guard and the
      // status flip are one race-free statement — during a live route
      // reassignment the exec can't confirm a delivery that moved off their
      // route, nor be wrongly 403'd by a stale read (audit EDG-11). Admins
      // (no executive row) have execRouteId === null and bypass the filter,
      // so they may confirm anyone.
      let execRouteId: string | null = null;
      if (me.role === 'EXECUTIVE') {
        const exec = await prisma.executive.findFirst({
          where: { userId: me.sub },
          select: { id: true, routeId: true },
        });
        executiveId = exec?.id ?? null;
        execRouteId = exec?.routeId ?? null;
        // An executive with no assigned route can never own a delivery
        // (deliveries always carry a non-null routeId), so reject up front
        // — matches the prior `exec.routeId !== delivery.routeId` 403 and
        // keeps the claim filter from degenerating into the admin bypass.
        if (exec && !execRouteId) {
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

      // Idempotent flip: ONLY a PENDING row gets touched. If the offline
      // sync engine retries after a network timeout, the second call
      // finds the row in DELIVERED/PARTIAL state, updateMany returns
      // count===0, and the cash double-credit path never runs.
      //
      // Without this guard, every retry created a fresh Payment row
      // (Payment.reference isn't unique) and re-incremented
      // Customer.balance — silently turning ₹100 cash into ₹300 over
      // 3 retries.
      const result = await prisma.$transaction(async (tx) => {
        const claim = await tx.delivery.updateMany({
          // The routeId predicate is the race-free ownership guard for
          // executives; admins pass execRouteId === null and skip it.
          where: {
            id,
            status: DeliveryStatus.PENDING,
            ...(execRouteId ? { routeId: execRouteId } : {}),
          },
          data: {
            status,
            deliveredLitres: actual,
            scannedAt: new Date(),
            ...(body.note !== undefined ? { note: body.note } : {}),
            ...(executiveId ? { executiveId } : {}),
          },
        });
        if (claim.count !== 1) {
          // Claim missed: either already confirmed/skipped (idempotent
          // retry) OR the row is on another route for this executive.
          // Distinguish the two with the row's current routeId so we still
          // 403 cross-route confirms instead of silently 200-ing them.
          const existing = await tx.delivery.findUnique({
            where: { id },
            include: { customer: true },
          });
          if (existing && execRouteId && existing.routeId !== execRouteId) {
            return { forbidden: true as const, alreadyDone: false as const };
          }
          return { forbidden: false as const, row: existing!, alreadyDone: true as const };
        }
        const updated = await tx.delivery.findUnique({
          where: { id },
          include: { customer: true },
        });

        if (typeof body.cashCollected === 'number' && body.cashCollected > 0) {
          await tx.payment.create({
            data: {
              customerId: updated!.customerId,
              amount: body.cashCollected,
              mode: PaymentMode.CASH,
              status: PaymentStatus.PAID,
              reference: `delivery:${id}`,
              paidAt: new Date(),
            },
          });
          await tx.customer.update({
            where: { id: updated!.customerId },
            data: { balance: { increment: body.cashCollected } },
          });
        }

        return { forbidden: false as const, row: updated!, alreadyDone: false as const };
      });

      // Cross-route confirm attempt detected inside the atomic claim — same
      // 403 the pre-claim read used to return, now race-safe (audit EDG-11).
      if (result.forbidden) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Delivery is on another route',
        });
      }
      // Surface "already confirmed" with a 200 + idempotent flag — the
      // mobile offline-sync engine treats this the same as success and
      // won't enqueue another retry. Caller still gets the row body.
      if (result.alreadyDone) {
        return reply
          .header('x-idempotent', '1')
          .status(200)
          .send({ ...result.row, idempotent: true });
      }
      return result.row;
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
      // EDG-11: fold route-ownership into the atomic claim (same as /confirm) so
      // a live route reassignment can't let an exec skip a delivery that moved
      // off their route, nor wrongly 403 them via a stale pre-read.
      let execRouteId: string | null = null;
      if (me.role === 'EXECUTIVE') {
        const exec = await prisma.executive.findFirst({
          where: { userId: me.sub },
          select: { id: true, routeId: true },
        });
        executiveId = exec?.id ?? null;
        execRouteId = exec?.routeId ?? null;
        if (exec && !execRouteId) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Delivery is on another route',
          });
        }
      }

      // Idempotent skip — only PENDING flips. A retry from the offline
      // queue lands on the already-SKIPPED row, claim.count===0, and
      // we return the existing row with idempotent flag.
      const claim = await prisma.delivery.updateMany({
        where: {
          id,
          status: DeliveryStatus.PENDING,
          ...(execRouteId ? { routeId: execRouteId } : {}),
        },
        data: {
          status: DeliveryStatus.SKIPPED,
          note: body.reason ?? 'Skipped',
          ...(executiveId ? { executiveId } : {}),
        },
      });
      const current = await prisma.delivery.findUnique({
        where: { id },
        include: { customer: true },
      });
      if (claim.count !== 1) {
        // Distinguish a cross-route skip attempt from an idempotent retry, the
        // same way /confirm does.
        if (current && execRouteId && current.routeId !== execRouteId) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Delivery is on another route',
          });
        }
        return reply
          .header('x-idempotent', '1')
          .status(200)
          .send({ ...current!, idempotent: true });
      }
      return current!;
    },
  });

  app.post('/:id/correct', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = CorrectBody.parse(req.body);

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
        if (!exec || exec.routeId !== delivery.routeId) {
          return reply.status(403).send({
            error: 'Forbidden',
            message: 'Delivery is on another route',
          });
        }
      }

      // Corrections are today-only — past days are closed for EOD reconciliation
      // and billing snapshots, so a retroactive edit there would silently rewrite
      // settled cash/litres.
      const today = startOfTodayUTC();
      if (delivery.scheduledFor.getTime() !== today.getTime()) {
        return reply.status(422).send({
          error: 'NotToday',
          message: 'Only today’s deliveries can be corrected.',
        });
      }

      const scheduled = new Prisma.Decimal(delivery.scheduledLitres);
      const skip = body.skip === true;
      const newLitres = skip
        ? new Prisma.Decimal(0)
        : body.deliveredLitres === undefined
          ? scheduled
          : new Prisma.Decimal(body.deliveredLitres);
      if (!skip && newLitres.lte(0)) {
        return reply.status(422).send({
          error: 'ZeroLitres',
          message: 'Use skip:true to mark a stop as not delivered.',
        });
      }
      const status = skip
        ? DeliveryStatus.SKIPPED
        : newLitres.lt(scheduled)
          ? DeliveryStatus.PARTIAL
          : DeliveryStatus.DELIVERED;

      const corrected = await prisma.$transaction(async (tx) => {
        // Reverse any prior door-cash for this delivery, then re-post the
        // corrected amount, so Customer.balance and the EOD cash tally reflect
        // the correction rather than double-counting. The `delivery:<id>`
        // reference is unique, so the old (mistaken) row must go before the new.
        const ref = `delivery:${id}`;
        const existingCash = await tx.payment.findFirst({
          where: { reference: ref, mode: PaymentMode.CASH, status: PaymentStatus.PAID },
        });
        if (existingCash) {
          await tx.customer.update({
            where: { id: delivery.customerId },
            data: { balance: { decrement: existingCash.amount } },
          });
          await tx.payment.delete({ where: { id: existingCash.id } });
        }
        if (typeof body.cashCollected === 'number' && body.cashCollected > 0) {
          await tx.payment.create({
            data: {
              customerId: delivery.customerId,
              amount: body.cashCollected,
              mode: PaymentMode.CASH,
              status: PaymentStatus.PAID,
              reference: ref,
              paidAt: new Date(),
            },
          });
          await tx.customer.update({
            where: { id: delivery.customerId },
            data: { balance: { increment: body.cashCollected } },
          });
        }

        const auditNote = `[corrected ${executiveId ? `by exec ${executiveId}` : 'by admin'}]${
          body.reason ? ` ${body.reason}` : ''
        }`;
        return tx.delivery.update({
          where: { id },
          data: {
            status,
            deliveredLitres: skip ? null : newLitres,
            scannedAt: new Date(),
            note: auditNote,
            ...(executiveId ? { executiveId } : {}),
          },
          include: { customer: true },
        });
      });
      return corrected;
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
      for (const r of rows) {
        scheduledLitres = scheduledLitres.add(r.scheduledLitres);
        if (r.deliveredLitres) deliveredLitres = deliveredLitres.add(r.deliveredLitres);
        if (r.status === DeliveryStatus.DELIVERED) counts.delivered += 1;
        else if (r.status === DeliveryStatus.PARTIAL) counts.partial += 1;
        else if (r.status === DeliveryStatus.SKIPPED) counts.skipped += 1;
        else counts.pending += 1;
      }

      // Cash collected at THIS executive's deliveries today. Scope by the
      // `delivery:<id>` reference tag (cash recorded at confirm) rather than a
      // broad customerId match — otherwise cash another exec or an admin
      // collected from the same customer was misattributed (audit EDG-05/DAT-11).
      // Bound paidAt to today's window so future-dated cash can't leak in (BAC-02).
      const deliveryRefs = rows.map((r) => `delivery:${r.id}`);
      const tomorrow = new Date(today);
      tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
      const cashPayments = deliveryRefs.length
        ? await prisma.payment.findMany({
            where: {
              mode: PaymentMode.CASH,
              status: PaymentStatus.PAID,
              paidAt: { gte: today, lt: tomorrow },
              reference: { in: deliveryRefs },
            },
            select: { amount: true },
          })
        : [];
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
