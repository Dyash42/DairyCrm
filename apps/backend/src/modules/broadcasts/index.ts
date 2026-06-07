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
  app.addHook('onRequest', app.authenticate);

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
      const body = req.body as z.infer<typeof CreateBody>;
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
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const b = await prisma.broadcast.findUnique({
        where: { id },
        include: { routes: true },
      });
      if (!b) return reply.status(404).send({ error: 'NotFound' });
      if (b.status === BroadcastStatus.SENT) {
        return reply.status(409).send({ error: 'AlreadySent' });
      }

      const phones = await resolveRecipientPhones(
        b.target,
        b.routes.map((r) => r.routeId),
      );

      await prisma.broadcast.update({
        where: { id },
        data: { status: BroadcastStatus.SENDING, sentCount: phones.length },
      });

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
          delivered += 1;
        } catch {
          failed += 1;
        }
      }

      const updated = await prisma.broadcast.update({
        where: { id },
        data: {
          status: failed === phones.length ? BroadcastStatus.FAILED : BroadcastStatus.SENT,
          deliveredCount: delivered,
          failedCount: failed,
        },
      });
      return updated;
    },
  });
}
