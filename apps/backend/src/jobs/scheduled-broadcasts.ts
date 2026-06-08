/**
 * Scheduled-broadcast dispatcher.
 *
 * POST /broadcasts can persist with scheduledFor in the future and
 * status=SCHEDULED — but no worker was ever picking those up. They
 * sat in the DB forever, defeating the whole "schedule" feature.
 *
 * This cron runs every 5 minutes. For each Broadcast where
 * status=SCHEDULED AND scheduledFor <= now, run the same send pipeline
 * the synchronous POST /broadcasts/:id/send uses.
 *
 * We CLAIM the row via updateMany(status: SCHEDULED → SENDING) before
 * doing any work — concurrent ticks (in-process setInterval fallback +
 * BullMQ scheduler firing on the same minute) can both find the row,
 * but only one updateMany returns count===1.
 */

import { BroadcastStatus, CustomerStatus } from '@prisma/client';

import { prisma } from '../prisma';
import { sender } from '../whatsapp/sender';
import { TEMPLATES } from '../whatsapp/templates';
import { captureException } from '../observability';

async function resolveRecipientPhones(
  target: 'ALL' | 'ROUTES' | 'CUSTOMERS',
  routeIds: string[],
): Promise<string[]> {
  // CUSTOMERS isn't wired yet (the POST handler rejects with 422).
  // Treat as a no-op here so a row that somehow ended up scheduled
  // with target=CUSTOMERS doesn't blast everyone.
  if (target === 'CUSTOMERS') return [];

  const where: Record<string, unknown> = { status: CustomerStatus.ACTIVE };
  if (target === 'ROUTES' && routeIds.length > 0) {
    where.routeId = { in: routeIds };
  }
  const customers = await prisma.customer.findMany({
    where,
    select: { phone: true },
  });
  return customers.map((c) => c.phone);
}

export async function runScheduledBroadcastsOnce(
  now: Date = new Date(),
): Promise<{
  picked: number;
  sent: number;
  failed: number;
}> {
  const due = await prisma.broadcast.findMany({
    where: {
      status: BroadcastStatus.SCHEDULED,
      scheduledFor: { lte: now, not: null },
    },
    include: { routes: true },
    take: 20,
  });

  let sent = 0;
  let failed = 0;
  for (const b of due) {
    // Claim — only one tick across the cluster gets count===1.
    const claim = await prisma.broadcast.updateMany({
      where: { id: b.id, status: BroadcastStatus.SCHEDULED },
      data: { status: BroadcastStatus.SENDING },
    });
    if (claim.count !== 1) continue;

    try {
      const phones = await resolveRecipientPhones(
        b.target,
        b.routes.map((r) => r.routeId),
      );
      let delivered = 0;
      let failedRecipients = 0;
      for (const phone of phones) {
        try {
          await sender.send({
            kind: 'template',
            to: phone,
            templateName: TEMPLATES.broadcast_route_update.name,
            variables: { message_body: b.message },
          });
          // Per-recipient log row so admins can investigate
          // delivery failures later.
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
          failedRecipients += 1;
        }
      }
      await prisma.broadcast.update({
        where: { id: b.id },
        data: {
          status:
            failedRecipients === phones.length && phones.length > 0
              ? BroadcastStatus.FAILED
              : BroadcastStatus.SENT,
          sentCount: phones.length,
          deliveredCount: delivered,
          failedCount: failedRecipients,
        },
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      // Roll back so a future tick can retry. Reset to SCHEDULED only
      // if our claim is still the one that flipped it to SENDING
      // (compare-and-swap on the FAILED branch).
      await prisma.broadcast
        .updateMany({
          where: { id: b.id, status: BroadcastStatus.SENDING },
          data: { status: BroadcastStatus.SCHEDULED },
        })
        .catch(() => undefined);
      await captureException(err, { broadcastId: b.id });
    }
  }

  return { picked: due.length, sent, failed };
}
