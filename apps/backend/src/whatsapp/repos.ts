/**
 * Real Prisma-backed BotRepos.
 *
 * The bot engine reads/writes the same DB the admin and mobile see. When a
 * Postgres (Supabase or local) is connected the bot is live; otherwise the
 * engine fails loudly on first DB call, which is the correct dev signal.
 */

import {
  CustomerStatus,
  PaymentMode,
  PaymentStatus,
  QrCodeStatus,
  RenewalReminderStatus,
  SubscriptionStatus,
} from '@prisma/client';

import crypto from 'node:crypto';

import {
  DEFAULT_RATE_PER_LITRE_INR,
  LOCATION_TOKEN_TTL_DAYS,
  RENEWAL_REMINDER_DAYS_BEFORE,
} from '../constants';
import { prisma } from '../prisma';
import { nextCustomerCode } from '../services/customer-code';
import { buildVersionedQrPayload, generateQrDataUrl } from '../services/qrcode';
import { settings } from '../services/settings';
import { createRazorpayPaymentLink } from './payment';
import type { BotRepos } from './types';

/**
 * Resolve the live per-litre rate the same way the admin /subscriptions
 * endpoint does: the COW_MILK Product row is the source of truth; fall back
 * to the settings key, then the compiled-in default. Unifies the rate used
 * for the bot quote with the rate the activated subscription stores.
 */
async function resolveRatePerLitre(): Promise<number> {
  const product = await prisma.product.findUnique({ where: { code: 'COW_MILK' } });
  if (product) return Number(product.ratePerUnit);
  return settings.getNumber(
    'pricing.default_rate_per_litre_inr',
    DEFAULT_RATE_PER_LITRE_INR,
  );
}

export const prismaBotRepos: BotRepos = {
  async findCustomerByPhone(phone) {
    const c = await prisma.customer.findUnique({ where: { phone } });
    if (!c) return null;
    return { id: c.id, name: c.name, code: c.code };
  },

  async createCustomer(input) {
    const code = await nextCustomerCode(prisma);
    // Encode a VERSIONED payload (JHR-XXXXXX:v1) and write a QrCode audit row,
    // identical to the admin create path — so a later admin regenerate can
    // revoke this sticker and the version check holds for bot-onboarded
    // customers (the majority). Previously the bot wrote a bare, unversioned
    // QR and no QrCode row, defeating revoke/regenerate.
    const payload = buildVersionedQrPayload(code, 1);
    const qrCodeUrl = await generateQrDataUrl(payload);

    const c = await prisma.$transaction(async (tx) => {
      const created = await tx.customer.create({
        data: {
          code,
          name: input.name,
          phone: input.phone,
          altPhone: input.altPhone ?? null,
          email: input.email ?? null,
          addressLine1: input.addressLine1,
          litresPerDay: input.litresPerDay,
          qrCodeUrl,
          status: CustomerStatus.ACTIVE,
        },
      });
      await tx.qrCode.create({
        data: {
          customerId: created.id,
          payload,
          url: qrCodeUrl,
          status: QrCodeStatus.ACTIVE,
          version: 1,
        },
      });
      return created;
    });
    return { id: c.id, code: c.code, qrCodeUrl };
  },

  async getRatePerLitre() {
    return resolveRatePerLitre();
  },

  async createPaymentLink(input) {
    // Create the hosted link first so we know the gateway reference, then
    // persist a PENDING Payment keyed by it. The signed /payments/webhook
    // reconciles by this reference (razorpay entity.id / cashfree link_id),
    // flips it to PAID and credits Customer.balance. Without this row the
    // webhook always hit "unknown reference" and a real payment was lost.
    const link = await createRazorpayPaymentLink({
      customerId: input.customerId,
      amount: input.amount,
      note: input.note,
    });
    const payment = await prisma.payment.create({
      data: {
        customerId: input.customerId,
        amount: input.amount,
        mode: PaymentMode.UPI_ONLINE,
        status: PaymentStatus.PENDING,
        reference: link.id,
      },
    });
    return { url: link.url, paymentId: payment.id };
  },

  async getPaymentStatus(paymentId) {
    const p = await prisma.payment.findUnique({ where: { id: paymentId } });
    return p ? p.status : null;
  },

  async saveCustomerLocation(input) {
    await prisma.customer.update({
      where: { id: input.customerId },
      data: { lat: input.lat, lng: input.lng, geoUpdatedAt: new Date() },
    });
  },

  async createLocationToken(customerId) {
    const token = crypto.randomBytes(24).toString('base64url');
    const expiresAt = new Date(Date.now() + LOCATION_TOKEN_TTL_DAYS * 86_400_000);
    await prisma.locationToken.create({ data: { token, customerId, expiresAt } });
    return { token, expiresAt };
  },

  async activateSubscription(input) {
    // Single product lookup → derive both the rate and the productId.
    const product = await prisma.product.findUnique({ where: { code: 'COW_MILK' } });
    const ratePerLitre = product
      ? Number(product.ratePerUnit)
      : await settings.getNumber(
          'pricing.default_rate_per_litre_inr',
          DEFAULT_RATE_PER_LITRE_INR,
        );
    const productId = product?.id ?? null;
    const renewalLeadDays = await settings.getNumber(
      'subscription.renewal_reminder_days_before',
      RENEWAL_REMINDER_DAYS_BEFORE,
    );

    const subscriptionId = await prisma.$transaction(async (tx) => {
      // Reuse the customer's existing ACTIVE subscription if there is one.
      // Previously this ALWAYS created a new ACTIVE subscription, so a renewing
      // customer ended up with TWO active subs — inflating dashboard counts,
      // discarding unused paid days, and leaving "cancel" only cancelling one
      // (audit BAC-01). Also makes a double-fired activation extend rather than
      // duplicate (partial BAC-05).
      const existing = await tx.subscription.findFirst({
        where: { customerId: input.customerId, status: SubscriptionStatus.ACTIVE },
        orderBy: { createdAt: 'desc' },
      });
      const now = new Date();

      if (existing) {
        // RENEW / extend: roll the end date forward from the later of the
        // current endDate or today, so paid-for days are never lost.
        const base = existing.endDate && existing.endDate > now ? existing.endDate : now;
        const newEnd = new Date(base);
        newEnd.setUTCDate(newEnd.getUTCDate() + input.durationDays);
        const sub = await tx.subscription.update({
          where: { id: existing.id },
          data: {
            litresPerDay: input.litresPerDay,
            daysOfWeek: input.daysOfWeek,
            ratePerLitre,
            endDate: newEnd,
            status: SubscriptionStatus.ACTIVE,
          },
        });
        // Resolve the prior pending reminder as RENEWED (advances the PRD §9
        // renewal-rate metric, which was previously dead — audit BAC-07/
        // PRD-9.3) and schedule a fresh reminder for the new end date.
        await tx.renewalReminder.updateMany({
          where: { subscriptionId: sub.id, status: RenewalReminderStatus.PENDING },
          data: { status: RenewalReminderStatus.RENEWED, respondedAt: now },
        });
        const dueDate = new Date(newEnd);
        dueDate.setUTCDate(dueDate.getUTCDate() - renewalLeadDays);
        await tx.renewalReminder.create({
          data: {
            subscriptionId: sub.id,
            customerId: input.customerId,
            dueDate,
            status: RenewalReminderStatus.PENDING,
          },
        });
        await tx.customer.update({
          where: { id: input.customerId },
          data: { status: CustomerStatus.ACTIVE, litresPerDay: input.litresPerDay },
        });
        return sub.id;
      }

      // NEW subscription (first-time onboarding).
      const startDate = now;
      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + input.durationDays);
      const sub = await tx.subscription.create({
        data: {
          customerId: input.customerId,
          productId,
          sku: 'COW_MILK',
          litresPerDay: input.litresPerDay,
          daysOfWeek: input.daysOfWeek,
          ratePerLitre,
          startDate,
          endDate,
          status: SubscriptionStatus.ACTIVE,
        },
      });
      const dueDate = new Date(endDate);
      dueDate.setUTCDate(dueDate.getUTCDate() - renewalLeadDays);
      await tx.renewalReminder.create({
        data: {
          subscriptionId: sub.id,
          customerId: input.customerId,
          dueDate,
          status: RenewalReminderStatus.PENDING,
        },
      });
      await tx.customer.update({
        where: { id: input.customerId },
        data: { status: CustomerStatus.ACTIVE, litresPerDay: input.litresPerDay },
      });
      return sub.id;
    });
    return { subscriptionId };
  },

  async pauseSubscription(input) {
    // Find the active subscription for this customer (most recent).
    const sub = await prisma.subscription.findFirst({
      where: { customerId: input.customerId, status: SubscriptionStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) return;

    const start = new Date(input.startDate);
    const end = new Date(input.endDate);
    const resumeDate = new Date(end);
    resumeDate.setUTCDate(resumeDate.getUTCDate() + 1);

    await prisma.$transaction(async (tx) => {
      const pause = await tx.pauseRecord.create({
        data: {
          subscriptionId: sub.id,
          customerId: input.customerId,
          startDate: start,
          endDate: end,
          resumeDate,
        },
      });
      await tx.autoResumeJob.create({
        data: {
          pauseRecordId: pause.id,
          scheduledFor: resumeDate,
        },
      });
      await tx.subscription.update({
        where: { id: sub.id },
        data: { status: SubscriptionStatus.PAUSED },
      });
      await tx.customer.update({
        where: { id: input.customerId },
        data: { status: CustomerStatus.PAUSED },
      });
    });
  },

  async resumeSubscription(customerId) {
    const today = new Date();
    const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    await prisma.$transaction(async (tx) => {
      const sub = await tx.subscription.findFirst({
        where: { customerId, status: SubscriptionStatus.PAUSED },
        orderBy: { createdAt: 'desc' },
      });
      if (!sub) return;
      await tx.pauseRecord.updateMany({
        where: { subscriptionId: sub.id, endDate: { gte: todayUtc } },
        data: { endDate: todayUtc, resumeDate: new Date(todayUtc.getTime() + 86400000) },
      });
      await tx.subscription.update({
        where: { id: sub.id },
        data: { status: SubscriptionStatus.ACTIVE },
      });
      await tx.customer.update({
        where: { id: customerId },
        data: { status: CustomerStatus.ACTIVE },
      });
    });
  },

  async getActiveSubscription(customerId) {
    const sub = await prisma.subscription.findFirst({
      where: { customerId, status: SubscriptionStatus.ACTIVE },
      orderBy: { createdAt: 'desc' },
    });
    if (!sub) return null;
    return {
      id: sub.id,
      litresPerDay: Number(sub.litresPerDay),
      ratePerLitre: Number(sub.ratePerLitre),
      daysOfWeek: sub.daysOfWeek,
      endDate: sub.endDate,
    };
  },

  async getActivePause(customerId) {
    const today = new Date();
    const pause = await prisma.pauseRecord.findFirst({
      where: {
        customerId,
        startDate: { lte: today },
        endDate: { gte: today },
      },
      orderBy: { startDate: 'desc' },
    });
    if (!pause) return null;
    return { startDate: pause.startDate, endDate: pause.endDate };
  },

  async logSupportTicket(input) {
    // Until we have a SupportTicket table, log to WhatsAppLog as an audit trail.
    await prisma.whatsAppLog.create({
      data: {
        customerId: input.customerId,
        phone: '',
        direction: 'INBOUND',
        body: `[${input.kind}] ${input.note}${
          input.creditApplied ? ` · credit ₹${input.creditApplied}` : ''
        }`,
      },
    });
    if (input.creditApplied && input.creditApplied > 0) {
      await prisma.customer.update({
        where: { id: input.customerId },
        data: { balance: { increment: input.creditApplied } },
      });
    }
  },
};

// Backwards-compat with the engine import name. `prismaBotRepos` IS the
// production repo; the legacy alias is kept so older imports keep working.
export const stubRepos = prismaBotRepos;
