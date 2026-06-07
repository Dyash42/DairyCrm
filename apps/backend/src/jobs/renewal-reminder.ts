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
      await sender.send({
        kind: 'template',
        to: r.customer.phone,
        templateName: TEMPLATES.menu_returning.name,
        variables: { name: r.customer.name.split(' ')[0] ?? 'there' },
      });
      await prisma.renewalReminder.update({
        where: { id: r.id },
        data: { status: RenewalReminderStatus.SENT, sentAt: new Date() },
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      await captureException(err, { renewalReminderId: r.id });
    }
  }
  return { picked: due.length, sent, failed };
}
