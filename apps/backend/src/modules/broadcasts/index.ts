/**
 * Broadcasts module.
 *
 * GET   /broadcasts          — history (most recent first)
 * GET   /broadcasts/:id      — single broadcast with recipient counts
 * POST  /broadcasts          — create + queue (or schedule)
 * POST  /broadcasts/:id/send — fire it now (queues outbound messages)
 *
 * Phone-recipient resolution happens here: target=ROUTES → all active
 * customers on the picked routes. target=ALL → every active customer.
 * Send pipeline batches through the existing WhatsApp sender stub (no creds
 * → logs).
 */

import type { App } from '../../types';
import { z } from 'zod';
import { BroadcastStatus, BroadcastTarget, CustomerStatus } from '@prisma/client';

import { prisma } from '../../prisma';
import { sender } from '../../whatsapp/sender';
import { TEMPLATES } from '../../whatsapp/templates';

const CreateBody = z.object({
  message: z.string().min(1).max(1024),
  target: z.nativeEnum(BroadcastTarget),
  routeIds: z.array(z.string()).optional(),
  scheduledFor: z.coerce.date().optional(),
});

/**
 * Resolve a broadcast's audience into a flat list of phones.
 *
 * Supported targets:
 *   ALL     — every active customer
 *   ROUTES  — every active customer on one of the given route ids
 *
 * NOT YET WIRED (the validator rejects it before we get here):
 *   CUSTOMERS — per-customer targeting. Schema needs a customerIds array
 *               (or BroadcastCustomer join) before this can be supported.
 *               The enum value stays so we can land the feature without a
 *               schema enum migration.
 */
async function resolveRecipientPhones(
  target: BroadcastTarget,
  routeIds: string[],
): Promise<string[]> {
  const where: Record<string, unknown> = { status: CustomerStatus.ACTIVE };
  if (target === BroadcastTarget.ROUTES && routeIds.length > 0) {
    where.routeId = { in: routeIds };
  }
  const customers = await prisma.customer.findMany({
    where,
    select: { phone: true },
  });
  return customers.map((c) => c.phone);
}

export async function registerBroadcastRoutes(app: App) {
  // Admin-only — sending a broadcast is sending a marketing/utility
  // WhatsApp template to potentially 400+ customers; it has billing +
  // brand implications. Without this guard any EXECUTIVE could fire a
  // blast at will.
  app.addHook('onRequest', app.authenticate);
  app.addHook('onRequest', app.requireRole('ADMIN'));

  app.get('/', async () => {
    const rows = await prisma.broadcast.findMany({
      include: { routes: { include: { route: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return { broadcasts: rows };
  });

  app.get('/:id', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const b = await prisma.broadcast.findUnique({
        where: { id },
        include: { routes: { include: { route: true } } },
      });
      if (!b) return reply.status(404).send({ error: 'NotFound' });
      return b;
    },
  });

  app.post('/', {
    handler: async (req, reply) => {
      const body = CreateBody.parse(req.body);
      const me = req.user;

      // Guard against the unwired target until the schema column lands.
      // Without this, picking CUSTOMERS would silently broadcast to ALL,
      // which is worse than a clear error message.
      if (body.target === BroadcastTarget.CUSTOMERS) {
        return reply.status(422).send({
          error: 'NotImplemented',
          message:
            'Per-customer broadcasts are not yet supported. Pick ALL or ROUTES for now.',
        });
      }

      const status = body.scheduledFor
        ? BroadcastStatus.SCHEDULED
        : BroadcastStatus.DRAFT;

      const created = await prisma.$transaction(async (tx) => {
        const b = await tx.broadcast.create({
          data: {
            message: body.message,
            target: body.target,
            scheduledFor: body.scheduledFor,
            status,
            createdById: me.sub,
            templateName: TEMPLATES.broadcast_route_update.name,
          },
        });
        if (body.target === BroadcastTarget.ROUTES && body.routeIds) {
          await tx.broadcastRoute.createMany({
            data: body.routeIds.map((routeId) => ({ broadcastId: b.id, routeId })),
          });
        }
        return b;
      });
      return reply.status(201).send(created);
    },
  });

  app.post('/:id/send', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };

      // Atomic claim: only one caller can flip DRAFT/SCHEDULED → SENDING.
      // Without this, a double-click on "Send" (or two admins clicking
      // at the same time) double-fires the entire blast. Blocks SENT and
      // SENDING — the previous code only blocked SENT, leaving a fresh
      // re-fire path while the first one was still in flight.
      const claim = await prisma.broadcast.updateMany({
        where: {
          id,
          status: { in: [BroadcastStatus.DRAFT, BroadcastStatus.SCHEDULED] },
        },
        data: { status: BroadcastStatus.SENDING },
      });
      if (claim.count !== 1) {
        const current = await prisma.broadcast.findUnique({ where: { id } });
        if (!current) return reply.status(404).send({ error: 'NotFound' });
        return reply.status(409).send({
          error: 'InvalidStateTransition',
          message: `Broadcast is ${current.status}; only DRAFT or SCHEDULED can be sent.`,
        });
      }

      const b = await prisma.broadcast.findUnique({
        where: { id },
        include: { routes: true },
      });
      if (!b) return reply.status(404).send({ error: 'NotFound' });

      const phones = await resolveRecipientPhones(
        b.target,
        b.routes.map((r) => r.routeId),
      );

      let delivered = 0;
      let failed = 0;
      for (const phone of phones) {
        try {
          await sender.send({
            kind: 'template',
            to: phone,
            templateName: TEMPLATES.broadcast_route_update.name,
            variables: { message_body: b.message },
          });
          // Persist per-recipient row so admins can investigate
          // exactly who got it. The previous code aggregated to
          // delivered/failed counts only, with no way to retry the
          // failed ones or audit a specific customer's complaint.
          await prisma.whatsAppLog.create({
            data: {
              phone,
              direction: 'OUTBOUND',
              templateId: TEMPLATES.broadcast_route_update.name,
              category: 'MARKETING',
              body: b.message.slice(0, 500),
              status: 'sent',
            },
          }).catch(() => undefined);
          delivered += 1;
        } catch {
          failed += 1;
          await prisma.whatsAppLog.create({
            data: {
              phone,
              direction: 'OUTBOUND',
              templateId: TEMPLATES.broadcast_route_update.name,
              category: 'MARKETING',
              body: b.message.slice(0, 500),
              status: 'failed',
            },
          }).catch(() => undefined);
        }
      }

      const updated = await prisma.broadcast.update({
        where: { id },
        data: {
          status: failed === phones.length && phones.length > 0
            ? BroadcastStatus.FAILED
            : BroadcastStatus.SENT,
          sentCount: phones.length,
          deliveredCount: delivered,
          failedCount: failed,
        },
      });
      return updated;
    },
  });
}
