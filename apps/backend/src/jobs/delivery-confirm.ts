/**
 * Daily delivery-confirmation sender.
 *
 * PRD §6: after each scan, the customer gets a WhatsApp: "X litres
 * delivered today. Thank you." The mobile app marks deliveries via /confirm
 * but does NOT send the WhatsApp itself — that goes through this job so
 * a single Redis-backed pipeline does throttling, retries, etc.
 *
 * Strategy: at a configurable cadence (default every 10 minutes), pick up
 * Delivery rows where status = DELIVERED|PARTIAL and `confirmationSentAt`
 * is null. Send the template; stamp confirmationSentAt.
 *
 * NOTE: `confirmationSentAt` would be a new column on Delivery; until we
 * add it, we use the `note` field as a flag (note starts with "[wa-sent]").
 * Add the proper column in the next schema iteration.
 */

import { DeliveryStatus } from '@prisma/client';

import { prisma } from '../prisma';
import { sender } from '../whatsapp/sender';
import { TEMPLATES } from '../whatsapp/templates';
import { captureException } from '../observability';

const SENT_MARKER = '[wa-sent]';

export async function runDeliveryConfirmOnce(): Promise<{
  picked: number;
  sent: number;
  failed: number;
}> {
  const recent = await prisma.delivery.findMany({
    where: {
      status: { in: [DeliveryStatus.DELIVERED, DeliveryStatus.PARTIAL] },
      scannedAt: { not: null },
      OR: [
        { note: null },
        { note: { not: { startsWith: SENT_MARKER } } },
      ],
    },
    include: { customer: true },
    take: 200,
  });

  let sent = 0;
  let failed = 0;
  for (const d of recent) {
    try {
      const litres = Number(d.deliveredLitres ?? d.scheduledLitres);
      await sender.send({
        kind: 'template',
        to: d.customer.phone,
        templateName: TEMPLATES.delivery_confirmation.name,
        variables: {
          litres: litres % 1 === 0 ? String(litres) : litres.toFixed(1),
          address_short: d.customer.addressLine1.split(',')[0]?.trim() ?? '',
        },
      });
      await prisma.delivery.update({
        where: { id: d.id },
        data: { note: `${SENT_MARKER} ${d.note ?? ''}`.trim() },
      });
      sent += 1;
    } catch (err) {
      failed += 1;
      await captureException(err, { deliveryId: d.id });
    }
  }
  return { picked: recent.length, sent, failed };
}
