/**
 * End-of-day MISSED tracker.
 *
 * PRD §7 dashboard surfaces a "missed" KPI but no code was setting
 * DeliveryStatus.MISSED — PENDING rows for past dates accumulated
 * forever, inflating the "pending" tile and showing 0 missed.
 *
 * This cron runs once per day (~09:00 IST by default, after the
 * morning delivery window closes) and flips any PENDING row whose
 * scheduledFor is strictly before today to MISSED.
 *
 * Why we don't run it more often: an executive may scan a delivery
 * late in the morning. We don't want a 06:30 cron tick to mark
 * deliveries MISSED that get confirmed at 07:00. One run/day, after
 * the realistic delivery window, balances the two concerns. The
 * window cutoff is admin-configurable via the
 * `delivery.morning_window_end_hour` setting (default 9).
 */

import { DeliveryStatus } from '@prisma/client';

import { prisma } from '../prisma';
import { startOfBusinessDayUTC } from '../utils/dates';

export async function runEndOfDayMissedOnce(
  now: Date = new Date(),
): Promise<{
  picked: number;
  flipped: number;
}> {
  const today = startOfBusinessDayUTC(now);

  // Any PENDING delivery whose scheduledFor was BEFORE today's
  // business-day boundary is no longer recoverable — the milkman
  // moved on. Flip it to MISSED.
  const result = await prisma.delivery.updateMany({
    where: {
      status: DeliveryStatus.PENDING,
      scheduledFor: { lt: today },
    },
    data: { status: DeliveryStatus.MISSED },
  });

  return { picked: result.count, flipped: result.count };
}
