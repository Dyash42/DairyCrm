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
    // Atomic claim — only one parallel worker will succeed.
    const claim = await prisma.autoResumeJob.updateMany({
      where: { id: job.id, status: AutoResumeStatus.PENDING },
      data: { status: AutoResumeStatus.RESUMED, resumedAt: new Date() },
    });
    if (claim.count === 0) continue;

    try {
      await prisma.$transaction(async (tx) => {
        await tx.subscription.update({
          where: { id: job.pauseRecord.subscriptionId },
          data: { status: SubscriptionStatus.ACTIVE },
        });
        await tx.customer.update({
          where: { id: job.pauseRecord.customerId },
          data: { status: CustomerStatus.ACTIVE },
        });
      });

      await sender.send({
        kind: 'template',
        to: job.pauseRecord.customer.phone,
        templateName: TEMPLATES.auto_resume_reminder.name,
        variables: {
          name: job.pauseRecord.customer.name.split(' ')[0] ?? 'there',
          litres_per_day: String(
            Number(job.pauseRecord.subscription.litresPerDay),
          ),
        },
      });
      resumed += 1;
    } catch (err) {
      failed += 1;
      // Roll the job back to FAILED so it doesn't loop on PENDING forever
      // (subscription/customer may have been partially updated — admin
      // sees FAILED + lastError and can retry from the admin UI).
      await prisma.autoResumeJob
        .updateMany({
          where: { id: job.id, status: AutoResumeStatus.RESUMED },
          data: {
            status: AutoResumeStatus.FAILED,
            attempts: { increment: 1 },
            lastError: err instanceof Error ? err.message.slice(0, 500) : String(err),
          },
        })
        .catch(() => undefined);
      await captureException(err, { jobId: job.id });
    }
  }
  return { picked: due.length, resumed, failed };
}
