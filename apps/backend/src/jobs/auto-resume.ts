/**
 * Auto-resume cron job.
 *
 * PRD §4: "Auto-resume on End Date + 1, with a reminder message."
 *
 * Picks up every `AutoResumeJob` whose `scheduledFor <= now` and:
 *   1. Marks the linked PauseRecord as resumed
 *   2. Sets the subscription + customer back to ACTIVE
 *   3. Sends the auto-resume reminder WhatsApp template
 *   4. Marks the AutoResumeJob status = RESUMED
 *
 * Idempotent: an already-RESUMED row is a no-op.
 */

import {
  AutoResumeStatus,
  CustomerStatus,
  SubscriptionStatus,
} from '@prisma/client';

import { prisma } from '../prisma';
import { sender } from '../whatsapp/sender';
import { TEMPLATES } from '../whatsapp/templates';
import { captureException } from '../observability';
import { startOfBusinessDayUTC } from '../utils/dates';

export async function runAutoResumeOnce(now: Date = new Date()): Promise<{
  picked: number;
  resumed: number;
  failed: number;
}> {
  const due = await prisma.autoResumeJob.findMany({
    where: {
      status: AutoResumeStatus.PENDING,
      scheduledFor: { lte: now },
    },
    include: {
      pauseRecord: {
        include: {
          customer: true,
          subscription: true,
        },
      },
    },
    take: 200,
  });

  let resumed = 0;
  let failed = 0;
  for (const job of due) {
    const sub = job.pauseRecord.subscription;
    const expired = Boolean(sub.endDate && sub.endDate < startOfBusinessDayUTC(now));

    // Claim AND activate in ONE transaction (audit ARC-06/EDG-12). Previously
    // the job was marked RESUMED first, then the activation ran separately — a
    // crash in between left the job RESUMED while the subscription stayed
    // PAUSED, so it was never retried and the customer was stuck paused
    // forever. Now: the atomic claim (updateMany on PENDING) is the
    // concurrency guard, and if the transaction rolls back the job stays
    // PENDING and retries next tick.
    let claimed = false;
    try {
      await prisma.$transaction(async (tx) => {
        const claim = await tx.autoResumeJob.updateMany({
          where: { id: job.id, status: AutoResumeStatus.PENDING },
          data: { status: AutoResumeStatus.RESUMED, resumedAt: new Date() },
        });
        if (claim.count === 0) return; // another worker already claimed it
        claimed = true;
        if (expired) {
          // Don't resurrect an expired sub — cancel instead (no reminder).
          await tx.subscription.updateMany({
            where: { id: sub.id, status: SubscriptionStatus.PAUSED },
            data: { status: SubscriptionStatus.CANCELLED },
          });
          return;
        }
        await tx.subscription.update({
          where: { id: job.pauseRecord.subscriptionId },
          data: { status: SubscriptionStatus.ACTIVE },
        });
        await tx.customer.update({
          where: { id: job.pauseRecord.customerId },
          data: { status: CustomerStatus.ACTIVE },
        });
      });
    } catch (err) {
      // Activation rolled back → job is still PENDING and will retry next tick.
      failed += 1;
      await captureException(err, { jobId: job.id });
      continue;
    }

    if (!claimed || expired) continue;

    // Best-effort reminder AFTER the resume is committed. A send failure must
    // NOT revert the resume — the customer IS active; just log it so the
    // message can be retried separately (audit ARC-06: send error used to flip
    // an already-successful resume to FAILED).
    try {
      await sender.send({
        kind: 'template',
        to: job.pauseRecord.customer.phone,
        templateName: TEMPLATES.auto_resume_reminder.name,
        variables: {
          name: job.pauseRecord.customer.name.split(' ')[0] ?? 'there',
          litres_per_day: String(Number(job.pauseRecord.subscription.litresPerDay)),
        },
      });
    } catch (err) {
      await captureException(err, { jobId: job.id, stage: 'reminder' });
    }
    resumed += 1;
  }
  return { picked: due.length, resumed, failed };
}
