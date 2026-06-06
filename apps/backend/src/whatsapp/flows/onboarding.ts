/**
 * Onboarding flow — drives a new number through name → address → email →
 * altPhone → daily quantity → account creation → days → payment → activation.
 *
 * Mirrors the design PDF (Jharanai WhatsApp Bot · flow 01).
 */

import type { FlowContext, FlowHandler } from '../types';
import { TEMPLATES } from '../templates';

const RATE_PER_LITRE = 64; // ₹/L from the PDF

interface OnboardCtx {
  name?: string;
  address?: string;
  email?: string;
  altPhone?: string;
  litresPerDay?: number;
  durationDays?: number;
}

export const onboardingFlow: FlowHandler = {
  async matches(ctx) {
    return ctx.state.flow === 'onboarding';
  },

  async handle(ctx) {
    const phone = ctx.message.from;
    const slot = ctx.state.context as OnboardCtx;

    if (ctx.message.kind !== 'text' && ctx.message.kind !== 'button') {
      return;
    }
    const text = ctx.message.kind === 'text' ? ctx.message.text.trim() : ctx.message.title;

    switch (ctx.state.step) {
      case 'ask_name': {
        const newCtx: OnboardCtx = { ...slot, name: text };
        ctx.patchState({ step: 'ask_address', context: newCtx as Record<string, unknown> });
        ctx.send({
          kind: 'text',
          to: phone,
          body: `Thanks, ${text.split(' ')[0]}! What is your delivery address?`,
        });
        return;
      }

      case 'ask_address': {
        const newCtx: OnboardCtx = { ...slot, address: text };
        ctx.patchState({ step: 'ask_email', context: newCtx as Record<string, unknown> });
        ctx.send({
          kind: 'text',
          to: phone,
          body: 'Got it. Your email for digital receipts?',
        });
        return;
      }

      case 'ask_email': {
        const newCtx: OnboardCtx = { ...slot, email: text };
        ctx.patchState({ step: 'ask_alt_phone', context: newCtx as Record<string, unknown> });
        ctx.send({
          kind: 'text',
          to: phone,
          body: 'An alternate mobile number (optional)?',
        });
        return;
      }

      case 'ask_alt_phone': {
        const skipped = /^skip$|^no$|^-$/i.test(text);
        const newCtx: OnboardCtx = { ...slot, altPhone: skipped ? undefined : text };
        ctx.patchState({ step: 'ask_litres', context: newCtx as Record<string, unknown> });
        ctx.send({
          kind: 'text',
          to: phone,
          body: 'How much milk would you like every day?',
        });
        return;
      }

      case 'ask_litres': {
        const litres = parseLitres(text);
        if (litres === null) {
          ctx.send({
            kind: 'text',
            to: phone,
            body: "Sorry, I didn't catch that. Please reply with a number like '1' or '1.5'.",
          });
          return;
        }
        const newCtx: OnboardCtx = { ...slot, litresPerDay: litres };
        ctx.send({ kind: 'text', to: phone, body: 'Creating your account…' });

        const customer = await ctx.repos.createCustomer({
          phone,
          name: slot.name ?? 'Customer',
          addressLine1: slot.address ?? '',
          email: slot.email,
          altPhone: slot.altPhone,
          litresPerDay: litres,
        });

        ctx.patchState({
          step: 'ask_days',
          context: newCtx as Record<string, unknown>,
          customerId: customer.id,
        });

        // Account-ready confirmation
        ctx.send({
          kind: 'template',
          to: phone,
          templateName: TEMPLATES.onboarding_account_ready.name,
          variables: { customer_code: customer.code },
        });
        // QR image
        ctx.send({
          kind: 'image',
          to: phone,
          mediaUrl: customer.qrCodeUrl,
          caption: `Your Jharanai QR · ${customer.code}\nShow this to your milkman at delivery.`,
        });
        // Days prompt
        ctx.send({
          kind: 'text',
          to: phone,
          body: 'For how many days would you like to subscribe?',
        });
        return;
      }

      case 'ask_days': {
        const days = parseDays(text);
        if (days === null) {
          ctx.send({
            kind: 'text',
            to: phone,
            body: "Please reply with a number of days, e.g. '30'.",
          });
          return;
        }
        const litres = slot.litresPerDay ?? 0;
        const total = Math.round(litres * days * RATE_PER_LITRE);

        const newCtx: OnboardCtx = { ...slot, durationDays: days };
        ctx.patchState({ step: 'await_payment', context: newCtx as Record<string, unknown> });

        ctx.send({
          kind: 'template',
          to: phone,
          templateName: TEMPLATES.onboarding_payment_link.name,
          variables: {
            litres: String(litres),
            days: String(days),
            rate: String(RATE_PER_LITRE),
            total: String(total),
          },
        });

        const link = await ctx.repos.createPaymentLink({
          customerId: ctx.state.customerId ?? '',
          amount: total,
          note: `Jharanai subscription · ${litres}L × ${days} days`,
        });
        ctx.send({ kind: 'text', to: phone, body: link.url });
        return;
      }

      case 'await_payment': {
        // In production we receive a Razorpay webhook to activate.
        // For dev: if customer texts "paid", we activate.
        if (/paid|success|done/i.test(text) && ctx.state.customerId) {
          await ctx.repos.activateSubscription({
            customerId: ctx.state.customerId,
            litresPerDay: slot.litresPerDay ?? 0,
            daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
            durationDays: slot.durationDays ?? 30,
          });
          ctx.send({
            kind: 'template',
            to: phone,
            templateName: TEMPLATES.subscription_activated.name,
            variables: { litres_per_day: String(slot.litresPerDay ?? 0) },
          });
          ctx.patchState({ flow: null, step: null, context: {} });
        }
        return;
      }

      default: {
        // Unknown step — reset.
        ctx.patchState({ flow: null, step: null, context: {} });
      }
    }
  },
};

function parseLitres(s: string): number | null {
  const m = s.match(/(\d+(?:\.\d+)?)/);
  if (!m || !m[1]) return null;
  const n = Number(m[1]);
  if (Number.isNaN(n) || n <= 0 || n > 50) return null;
  return n;
}

function parseDays(s: string): number | null {
  const m = s.match(/(\d+)/);
  if (!m || !m[1]) return null;
  const n = Number(m[1]);
  if (Number.isNaN(n) || n <= 0 || n > 365) return null;
  return n;
}
