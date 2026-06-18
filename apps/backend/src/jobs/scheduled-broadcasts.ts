/**
 * Scheduled-broadcast dispatcher + reusable per-broadcast send pipeline.
 *
 * POST /broadcasts can persist with scheduledFor in the future and
 * status=SCHEDULED — but no worker was ever picking those up. They
 * sat in the DB forever, defeating the whole "schedule" feature.
 *
 * This cron runs every 5 minutes. For each Broadcast where
 * status=SCHEDULED AND scheduledFor <= now, run the same send pipeline
 * the POST /broadcasts/:id/send path uses.
 *
 * We CLAIM the row via updateMany(status: DRAFT/SCHEDULED → SENDING)
 * before doing any work — concurrent ticks (in-process setInterval
 * fallback + BullMQ scheduler firing on the same minute, or a manual
 * POST racing the cron) can both find the row, but only one updateMany
 * returns count===1.
 *
 * audit ARC-04/INT-03/PER-05: the per-broadcast pipeline used to live
 * inline inside the HTTP handler, which looped every recipient with an
 * await sender.send() + a per-recipient WhatsAppLog write INSIDE the
 * request — large blasts timed out and left the broadcast stuck in
 * SENDING. It's now a reusable runBroadcastSendOnce(broadcastId) that
 * the background queue runs off the HTTP request thread.
 */

import { BroadcastStatus, CustomerStatus } from '@prisma/client';

import { prisma } from '../prisma';
import { sender } from '../whatsapp/sender';
import { TEMPLATES } from '../whatsapp/templates';
import { captureException } from '../observability';

/**
 * One resolved broadcast recipient. customerId is the owning Customer so
 * each WhatsAppLog row can be attributed back to a customer for
 * per-customer audit / targeted retry (audit ADM-11). It is nullable only
 * for genuinely customer-less recipients; here every recipient comes from
 * a Customer row, so it is always populated.
 */
interface BroadcastRecipient {
  customerId: string | null;
  phone: string;
}

async function resolveRecipientPhones(
  target: 'ALL' | 'ROUTES' | 'CUSTOMERS',
  routeIds: string[],
): Promise<BroadcastRecipient[]> {
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
    select: { id: true, phone: true },
  });
  return customers.map((c) => ({ customerId: c.id, phone: c.phone }));
}

/**
 * Result of one runBroadcastSendOnce call.
 *
 *   claimed  — false when the row wasn't in a sendable state (already
 *              SENT/SENDING, or gone). The caller did nothing.
 *   status   — terminal status written (SENT | FAILED) when claimed.
 */
export interface BroadcastSendResult {
  broadcastId: string;
  claimed: boolean;
  status?: BroadcastStatus;
  sentCount: number;
  deliveredCount: number;
  failedCount: number;
}

/**
 * Run the full send pipeline for ONE broadcast (audit ARC-04).
 *
 * Atomically claims DRAFT/SCHEDULED → SENDING (so a double-click, two
 * admins, or a cron tick racing the POST can't double-fire), resolves
 * the audience, sends to each recipient with per-recipient resilience,
 * batches the WhatsAppLog rows in a single createMany, and finalizes
 * the counts + terminal status (SENT, or FAILED when every recipient
 * failed). On an unexpected error mid-flight it rolls the row back to
 * the state it was claimed from so a future tick / retry can pick it up
 * again.
 *
 * Returns claimed=false (and does nothing) when the row is not in a
 * sendable state — the caller can treat that as a no-op.
 */
export async function runBroadcastSendOnce(
  broadcastId: string,
): Promise<BroadcastSendResult> {
  // Read the pre-claim status so a mid-flight failure can roll back to
  // exactly where we found it (DRAFT vs SCHEDULED) rather than forcing
  // a SCHEDULED that loses the original intent.
  const before = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    select: { status: true },
  });
  if (
    !before ||
    (before.status !== BroadcastStatus.DRAFT &&
      before.status !== BroadcastStatus.SCHEDULED)
  ) {
    return {
      broadcastId,
      claimed: false,
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0,
    };
  }
  const claimedFrom = before.status;

  // Atomic claim — only one caller across the cluster gets count===1.
  const claim = await prisma.broadcast.updateMany({
    where: {
      id: broadcastId,
      status: { in: [BroadcastStatus.DRAFT, BroadcastStatus.SCHEDULED] },
    },
    data: { status: BroadcastStatus.SENDING },
  });
  if (claim.count !== 1) {
    return {
      broadcastId,
      claimed: false,
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0,
    };
  }

  const b = await prisma.broadcast.findUnique({
    where: { id: broadcastId },
    include: { routes: true },
  });
  if (!b) {
    // Vanished between claim and read — nothing more we can do.
    return {
      broadcastId,
      claimed: false,
      sentCount: 0,
      deliveredCount: 0,
      failedCount: 0,
    };
  }

  try {
    const recipients = await resolveRecipientPhones(
      b.target,
      b.routes.map((r) => r.routeId),
    );

    let delivered = 0;
    let failedRecipients = 0;
    // Collect per-recipient log rows and flush them in one createMany at
    // the end (audit PER-05) instead of an await-per-recipient inside the
    // loop — that serialised a DB round-trip behind every send and was a
    // big part of the request-time blow-up.
    //
    // Each row carries customerId (audit ADM-11) so a log entry is
    // attributable to a specific customer for per-customer audit and so
    // the failed subset is retryable.
    const logRows: {
      customerId: string | null;
      phone: string;
      direction: 'OUTBOUND';
      templateId: string;
      category: 'MARKETING';
      body: string;
      status: 'sent' | 'failed';
    }[] = [];
    const body = b.message.slice(0, 500);
    for (const { customerId, phone } of recipients) {
      try {
        await sender.send({
          kind: 'template',
          to: phone,
          templateName: TEMPLATES.broadcast_route_update.name,
          variables: { message_body: b.message },
        });
        delivered += 1;
        logRows.push({
          customerId,
          phone,
          direction: 'OUTBOUND',
          templateId: TEMPLATES.broadcast_route_update.name,
          category: 'MARKETING',
          body,
          status: 'sent',
        });
      } catch {
        failedRecipients += 1;
        logRows.push({
          customerId,
          phone,
          direction: 'OUTBOUND',
          templateId: TEMPLATES.broadcast_route_update.name,
          category: 'MARKETING',
          body,
          status: 'failed',
        });
      }
    }

    // Batched write — best-effort, same as the previous per-row .catch().
    if (logRows.length > 0) {
      await prisma.whatsAppLog
        .createMany({ data: logRows })
        .catch(() => undefined);
    }

    const recipientCount = recipients.length;
    const finalStatus =
      failedRecipients === recipientCount && recipientCount > 0
        ? BroadcastStatus.FAILED
        : BroadcastStatus.SENT;
    await prisma.broadcast.update({
      where: { id: b.id },
      data: {
        status: finalStatus,
        sentCount: recipientCount,
        deliveredCount: delivered,
        failedCount: failedRecipients,
      },
    });

    return {
      broadcastId,
      claimed: true,
      status: finalStatus,
      sentCount: recipientCount,
      deliveredCount: delivered,
      failedCount: failedRecipients,
    };
  } catch (err) {
    // Roll back to the pre-claim status so a future tick / retry can
    // pick it up again. Compare-and-swap on SENDING so we only undo our
    // own claim, never another worker's in-flight send.
    await prisma.broadcast
      .updateMany({
        where: { id: b.id, status: BroadcastStatus.SENDING },
        data: { status: claimedFrom },
      })
      .catch(() => undefined);
    await captureException(err, { broadcastId: b.id });
    throw err;
  }
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
    select: { id: true },
    take: 20,
  });

  let sent = 0;
  let failed = 0;
  for (const { id } of due) {
    try {
      const res = await runBroadcastSendOnce(id);
      // Another tick may have claimed it first (claimed===false) — that's
      // not a failure, just nothing for us to do.
      if (res.claimed) sent += 1;
    } catch {
      // runBroadcastSendOnce already rolled the row back to SCHEDULED and
      // captured the exception; just count it so the tick summary is honest.
      failed += 1;
    }
  }

  return { picked: due.length, sent, failed };
}
