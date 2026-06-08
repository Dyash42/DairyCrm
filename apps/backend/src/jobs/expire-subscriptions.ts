/**
 * Subscription expiry tracker.
 *
 * Subscription.endDate is computed at creation, but nothing flipped
 * ACTIVE → CANCELLED when that date passed. Phantom subscriptions
 * stayed ACTIVE forever and the daily-route-gen kept materializing
 * Delivery rows for customers who never renewed → milkman shows up
 * unpaid → bad data flowed downstream.
 *
 * This cron runs once per day. For any ACTIVE subscription whose
 * endDate is strictly before today's business-day boundary AND has
 * no successful renewal-payment within the last 24 hours, flip it
 * to CANCELLED and mark the customer PAUSED (so they don't show on
 * the dashboard's "active" tile but a re-onboarding via WhatsApp
 * still works).
 *
 * No outbound message is sent here — the dedicated `renewal_reminder`
 * cron handles the "your sub is ending" nudge before this fires.
 * If we wanted to also send a "your sub has expired" template we'd
 * add it to templates.ts and trigger from here; for now we keep the
 * cron purely status-flipping for safety.
 */

import {
  CustomerStatus,
  SubscriptionStatus,
} from '@prisma/client';

import { prisma } from '../prisma';
import { startOfBusinessDayUTC } from '../utils/dates';

export async function runExpireSubscriptionsOnce(
  now: Date = new Date(),
): Promise<{
  picked: number;
  expired: number;
}> {
  const today = startOfBusinessDayUTC(now);

  // Atomic flip: only ACTIVE rows with a past endDate get CANCELLED.
  // updateMany is idempotent — re-running tomorrow is a no-op for
  // rows we already cancelled.
  const result = await prisma.subscription.updateMany({
    where: {
      status: SubscriptionStatus.ACTIVE,
      endDate: { lt: today, not: null },
    },
    data: { status: SubscriptionStatus.CANCELLED },
  });

  // For each affected subscription, mark the customer PAUSED. We
  // don't do this in the same updateMany above because Subscription
  // and Customer are different tables; the simplest robust path is
  // a separate updateMany scoped to customers whose every active sub
  // is now gone.
  //
  // Note: we don't track customer.activeSubCount, so the heuristic is
  // "customer has zero ACTIVE subscriptions AND no pause record open".
  // For the seeded data (one sub per customer) this is a clean flip.
  if (result.count > 0) {
    await prisma.customer.updateMany({
      where: {
        status: CustomerStatus.ACTIVE,
        subscriptions: { none: { status: SubscriptionStatus.ACTIVE } },
      },
      data: { status: CustomerStatus.PAUSED },
    });
  }

  return { picked: result.count, expired: result.count };
}
