/**
 * Real Prisma-backed BotRepos.
 *
 * Replaces the earlier stub. The bot engine now reads/writes the same DB
 * the admin and mobile see. When Supabase is connected the bot is live;
 * otherwise the engine still runs against any other Postgres (or fails
 * loudly on first call, which is the correct dev signal).
 */

import { CustomerStatus, SubscriptionStatus } from '@prisma/client';

import { prisma } from '../prisma';
import { nextCustomerCode } from '../services/customer-code';
import { generateQrDataUrl } from '../services/qrcode';
import { createRazorpayPaymentLink } from './payment';
import type { BotRepos } from './types';

export const prismaBotRepos: BotRepos = {
  async findCustomerByPhone(phone) {
    const c = await prisma.customer.findUnique({ where: { phone } });
    if (!c) return null;
    return { id: c.id, name: c.name, code: c.code };
  },

  async createCustomer(input) {
    const code = await nextCustomerCode(prisma);
    const qrCodeUrl = await generateQrDataUrl(code);
    const c = await prisma.customer.create({
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
    return { id: c.id, code: c.code, qrCodeUrl };
  },

  async createPaymentLink(input) {
    const link = await createRazorpayPaymentLink({
      customerId: input.customerId,
      amount: input.amount,
      note: input.note,
    });
    return { url: link.url };
  },

  async activateSubscription(input) {
    const startDate = new Date();
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + input.durationDays);

    // Use the customer's current ratePerLitre. For onboarding flow we use
    // the default 64 since the bot only collects litres + days. Admin can
    // override via the REST API.
    const ratePerLitre = 64;

    const sub = await prisma.subscription.create({
      data: {
        customerId: input.customerId,
        sku: 'COW_MILK',
        litresPerDay: input.litresPerDay,
        daysOfWeek: input.daysOfWeek,
        ratePerLitre,
        startDate,
        endDate,
        status: SubscriptionStatus.ACTIVE,
      },
    });
    return { subscriptionId: sub.id };
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

// Backwards-compat with the engine import name
export const stubRepos = prismaBotRepos;
