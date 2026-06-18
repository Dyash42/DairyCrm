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
import { BroadcastStatus, BroadcastTarget } from '@prisma/client';

import { prisma } from '../../prisma';
import { TEMPLATES } from '../../whatsapp/templates';
import { isJobsEnabled, getQueue, QUEUE_NAMES } from '../../jobs/queue';
import { runBroadcastSendOnce } from '../../jobs/scheduled-broadcasts';

const CreateBody = z.object({
  message: z.string().min(1).max(1024),
  target: z.nativeEnum(BroadcastTarget),
  routeIds: z.array(z.string()).optional(),
  scheduledFor: z.coerce.date().optional(),
});

// Audience resolution + the per-recipient send pipeline now live in
// jobs/scheduled-broadcasts.ts (runBroadcastSendOnce). POST /:id/send
// only ENQUEUES the work (audit ARC-04) so the HTTP request returns
// immediately instead of blocking on a 400+ recipient blast.

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

      // Validate the row is in a sendable state up front so we still
      // return the same 404 / 409 the synchronous handler did. We do NOT
      // claim → SENDING here: the actual claim (DRAFT/SCHEDULED → SENDING)
      // happens inside runBroadcastSendOnce so the background worker — or
      // the inline fallback below — owns the whole atomic pipeline. A
      // double-click is still safe: the worker's updateMany claim returns
      // count!==1 for the second run and no-ops.
      const current = await prisma.broadcast.findUnique({ where: { id } });
      if (!current) return reply.status(404).send({ error: 'NotFound' });
      if (
        current.status !== BroadcastStatus.DRAFT &&
        current.status !== BroadcastStatus.SCHEDULED
      ) {
        return reply.status(409).send({
          error: 'InvalidStateTransition',
          message: `Broadcast is ${current.status}; only DRAFT or SCHEDULED can be sent.`,
        });
      }

      // audit ARC-04/INT-03/PER-05: offload the per-recipient blast to the
      // background queue so the HTTP request returns immediately instead of
      // looping every (potentially 400+) recipient inline — which timed out
      // and left the broadcast wedged in SENDING.
      if (isJobsEnabled()) {
        await getQueue(QUEUE_NAMES.broadcastSend).add(
          'send',
          { broadcastId: id },
          { removeOnComplete: true, removeOnFail: 50 },
        );
        // 202 Accepted: the work is queued, not done. Shape stays
        // compatible — the admin UI reads { id, status } off the row.
        const queued = await prisma.broadcast.findUnique({ where: { id } });
        return reply.status(202).send(queued);
      }

      // Interval/no-Redis mode: no queue to enqueue onto, so run the
      // pipeline inline. runBroadcastSendOnce performs its own atomic
      // claim + finalizes counts/status; return the updated row.
      await runBroadcastSendOnce(id);
      const updated = await prisma.broadcast.findUnique({ where: { id } });
      if (!updated) return reply.status(404).send({ error: 'NotFound' });
      return updated;
    },
  });
}
