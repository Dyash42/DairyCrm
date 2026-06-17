/**
 * Onboarding flow — drives a new number through name → address → email →
 * altPhone → daily quantity → account creation → days → payment → activation.
 *
 * Mirrors the design PDF (Jharanai WhatsApp Bot · flow 01).
 *
 * Session-window prompts are loaded from the BotPrompt table via
 * `getPrompt(key, vars)` so non-tech admins can edit copy without a deploy.
 * Meta-approved templates stay in code (see ../templates.ts).
 */

import type { FlowContext, FlowHandler } from '../types';
import { TEMPLATES } from '../templates';
import { getPrompt } from '../prompts';
import { loadConfig } from '../../config';

interface OnboardCtx {
  name?: string;
  address?: string;
  email?: string;
  altPhone?: string;
  litresPerDay?: number;
  durationDays?: number;
  /** Local Payment row id for the issued link — used to verify payment. */
  paymentId?: string;
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
        const p = getPrompt('onboarding.ask_address', { firstName: text.split(' ')[0] ?? '' });
        ctx.send({ kind: 'text', to: phone, body: p.body });
        return;
      }

      case 'ask_address': {
        const newCtx: OnboardCtx = { ...slot, address: text };
        ctx.patchState({ step: 'ask_email', context: newCtx as Record<string, unknown> });
        ctx.send({ kind: 'text', to: phone, body: getPrompt('onboarding.ask_email').body });
        return;
      }

      case 'ask_email': {
        const newCtx: OnboardCtx = { ...slot, email: text };
        ctx.patchState({ step: 'ask_alt_phone', context: newCtx as Record<string, unknown> });
        ctx.send({ kind: 'text', to: phone, body: getPrompt('onboarding.ask_alt_phone').body });
        return;
      }

      case 'ask_alt_phone': {
        const skipped = /^skip$|^no$|^-$/i.test(text);
        const newCtx: OnboardCtx = { ...slot, altPhone: skipped ? undefined : text };
        ctx.patchState({ step: 'ask_litres', context: newCtx as Record<string, unknown> });
        ctx.send({ kind: 'text', to: phone, body: getPrompt('onboarding.ask_litres').body });
        return;
      }

      case 'ask_litres': {
        const litres = parseLitres(text);
        if (litres === null) {
          ctx.send({ kind: 'text', to: phone, body: getPrompt('onboarding.ask_litres.retry').body });
          return;
        }
        const newCtx: OnboardCtx = { ...slot, litresPerDay: litres };
        ctx.send({ kind: 'text', to: phone, body: getPrompt('onboarding.creating_account').body });

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
        // QR image (with editable session-window caption). Prefer a publicly
        // hosted HTTPS URL the WhatsApp Cloud API can fetch — Meta rejects the
        // data: URI. Falls back to the data URL on the stub provider / dev.
        const base = loadConfig().PUBLIC_BASE_URL;
        const qrImageUrl = base
          ? `${base.replace(/\/+$/, '')}/customers/${customer.id}/qr.png`
          : customer.qrCodeUrl;
        ctx.send({
          kind: 'image',
          to: phone,
          mediaUrl: qrImageUrl,
          caption: getPrompt('onboarding.qr_caption', { customerCode: customer.code }).body,
        });
        // Days prompt
        ctx.send({ kind: 'text', to: phone, body: getPrompt('onboarding.ask_days').body });
        return;
      }

      case 'ask_days': {
        const days = parseDays(text);
        if (days === null) {
          ctx.send({ kind: 'text', to: phone, body: getPrompt('onboarding.ask_days.retry').body });
          return;
        }
        const litres = slot.litresPerDay ?? 0;
        // Resolve the live rate the SAME way activation does, so the payment
        // link amount can never diverge from the rate the subscription stores.
        const rate = await ctx.repos.getRatePerLitre();
        const total = Math.round(litres * days * rate);

        // Create the hosted link + PENDING Payment up front so we can verify
        // the customer actually paid before activating the subscription.
        const link = await ctx.repos.createPaymentLink({
          customerId: ctx.state.customerId ?? '',
          amount: total,
          note: `Jharanai subscription · ${litres}L × ${days} days`,
        });

        const newCtx: OnboardCtx = { ...slot, durationDays: days, paymentId: link.paymentId };
        ctx.patchState({ step: 'await_payment', context: newCtx as Record<string, unknown> });

        ctx.send({
          kind: 'template',
          to: phone,
          templateName: TEMPLATES.onboarding_payment_link.name,
          variables: {
            litres: String(litres),
            days: String(days),
            rate: String(rate),
            total: String(total),
          },
        });
        ctx.send({ kind: 'text', to: phone, body: link.url });
        return;
      }

      case 'await_payment': {
        // Activate ONLY when the signature-verified gateway webhook has marked
        // the Payment PAID. The old code activated on the mere text "paid" with
        // zero verification — anyone could obtain a free subscription. The dev
        // shortcut is kept for non-production only so local testing works
        // without a real gateway.
        const status = slot.paymentId
          ? await ctx.repos.getPaymentStatus(slot.paymentId)
          : null;
        const devOverride =
          process.env.NODE_ENV !== 'production' && /paid|success|done/i.test(text);
        if ((status === 'PAID' || devOverride) && ctx.state.customerId) {
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
          // Capture the door location for last-mile navigation. The general
          // location flow saves whatever location the customer sends next;
          // the link lets them set it on a map if they're not home.
          const tok = await ctx.repos.createLocationToken(ctx.state.customerId);
          const base = loadConfig().ADMIN_ORIGIN.replace(/\/+$/, '');
          ctx.send({
            kind: 'text',
            to: phone,
            body: getPrompt('location.request', { pin_url: `${base}/pin/${tok.token}` }).body,
          });
          ctx.patchState({ flow: null, step: null, context: {} });
        } else {
          ctx.send({ kind: 'text', to: phone, body: getPrompt('payment.not_received').body });
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
