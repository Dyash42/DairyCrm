/**
 * Renewal reminder cron.
 *
 * PRD §9: "Subscription renewal rate (target >80%)" needs us to nudge
 * customers before expiry. We schedule a RenewalReminder row at sub
 * creation with `dueDate = endDate - renewal_reminder_days_before` (admin-
 * configurable).
 *
 * This job picks up due reminders, sends the WhatsApp template, and marks
 * the row SENT. Idempotent: already-SENT rows are ignored.
 */

import { RenewalReminderStatus } from '@prisma/client';

import { prisma } from '../prisma';
import { sender } from '../whatsapp/sender';
import { TEMPLATES } from '../whatsapp/templates';
import { captureException } from '../observability';

export async function runRenewalReminderOnce(now: Date = new Date()): Promise<{
  picked: number;
  sent: number;
  failed: number;
}> {
  const due = await prisma.renewalReminder.findMany({
    where: {
      status: RenewalReminderStatus.PENDING,
      dueDate: { lte: now },
    },
    include: {
      customer: true,
      subscription: true,
    },
    take: 100,
  });

  let sent = 0;
  let failed = 0;
  for (const r of due) {
    try {
      // Stamp SENT BEFORE the network call — if the send fails, the catch
      // resets it back to PENDING. Without this, a transient send failure
      // followed by a successful retry would re-send the same reminder
      // because the row stays PENDING for the whole send.
      await prisma.renewalReminder.update({
        where: { id: r.id, status: RenewalReminderStatus.PENDING },
        data: { status: RenewalReminderStatus.SENT, sentAt: new Date() },
      });
      await sender.send({
        kind: 'template',
        to: r.customer.phone,
        templateName: TEMPLATES.renewal_reminder.name,
        variables: {
          name: r.customer.name.split(' ')[0] ?? 'there',
          end_date: r.subscription.endDate
            ? r.subscription.endDate.toISOString().slice(0, 10)
            : '',
        },
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      // Roll back so a future tick can retry. Use updateMany so this is a
      // no-op if some other handler already moved the row.
      await prisma.renewalReminder.updateMany({
        where: { id: r.id, status: RenewalReminderStatus.SENT },
        data: { status: RenewalReminderStatus.PENDING, sentAt: null },
      }).catch(() => undefined);
      await captureException(err, { renewalReminderId: r.id });
    }
  }
  return { picked: due.length, sent, failed };
}
