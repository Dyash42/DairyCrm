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

import type { FlowContext, FlowHandler, SubscriptionIntent } from '../types';
import { TEMPLATES } from '../templates';
import { getPrompt } from '../prompts';
import { loadConfig } from '../../config';
import { countDeliveriesInRange } from '../../services/subscription-calc';
import { startOfBusinessDayUTC } from '../../utils/dates';
import { parseDaysOfWeek } from '../day-pattern';
import { buildActivationActions, pinPageBaseUrl } from '../activation';

interface OnboardCtx {
  name?: string;
  address?: string;
  email?: string;
  altPhone?: string;
  litresPerDay?: number;
  durationDays?: number;
  /** Chosen delivery weekdays (0=Sun..6=Sat) — BAC-04 honours the pattern. */
  daysOfWeek?: number[];
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
        // Honor "skip" (the prompt offers it) and validate the format — the
        // bot used to save 'skip' / garbage as the email (audit CUS-02).
        const skipped = /^skip$|^no$|^-$/i.test(text);
        if (!skipped && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) {
          ctx.send({
            kind: 'text',
            to: phone,
            body: 'That email doesn’t look right. Please enter a valid email, or type "skip".',
          });
          return;
        }
        const newCtx: OnboardCtx = { ...slot, email: skipped ? undefined : text };
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

        let customer: Awaited<ReturnType<typeof ctx.repos.createCustomer>>;
        try {
          customer = await ctx.repos.createCustomer({
            phone,
            name: slot.name ?? 'Customer',
            addressLine1: slot.address ?? '',
            email: slot.email,
            altPhone: slot.altPhone,
            litresPerDay: litres,
          });
        } catch (e) {
          // Duplicate phone (P2002): this number already has an account. Don't
          // strand the FSM after "creating your account…" (audit CUS-05).
          if ((e as { code?: string }).code === 'P2002') {
            ctx.send({
              kind: 'text',
              to: phone,
              body: 'It looks like you already have an account with us. Send "Hi" to see your menu.',
            });
            ctx.patchState({ flow: null, step: null, context: {} });
            return;
          }
          throw e;
        }

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
        // BAC-04/CUS-09: ask the day-of-week pattern before quoting, so a
        // customer who wants Mon–Sat / weekdays-only isn't force-enrolled in
        // 7-day delivery (and billed for it). The quote is computed once the
        // pattern is known.
        const newCtx: OnboardCtx = { ...slot, durationDays: days };
        ctx.patchState({ step: 'ask_days_pattern', context: newCtx as Record<string, unknown> });
        ctx.send({ kind: 'text', to: phone, body: getPrompt('onboarding.ask_days_pattern').body });
        return;
      }

      case 'ask_days_pattern': {
        const dow = parseDaysOfWeek(text);
        if (!dow) {
          ctx.send({
            kind: 'text',
            to: phone,
            body: getPrompt('onboarding.ask_days_pattern.retry').body,
          });
          return;
        }
        const litres = slot.litresPerDay ?? 0;
        const duration = slot.durationDays ?? 30;
        // Resolve the live rate the SAME way activation does, so the payment
        // link amount can never diverge from the rate the subscription stores.
        const rate = await ctx.repos.getRatePerLitre();
        // BAC-04/DAT-05: bill for the deliveries we will ACTUALLY make over the
        // chosen window + pattern, using the exact same counter the scheduler
        // materializes from — so billed === delivered for any day pattern.
        const deliveries = countDeliveriesInRange(startOfBusinessDayUTC(), duration, dow);
        const total = Math.round(deliveries * litres * rate);

        // EDG-02: stash the activation intent on the PENDING Payment so the
        // signature-verified webhook can finalize the subscription on PAID
        // without waiting for the customer to message again.
        const intent: SubscriptionIntent = {
          kind: 'onboarding',
          litresPerDay: litres,
          daysOfWeek: dow,
          durationDays: duration,
        };
        const link = await ctx.repos.createPaymentLink({
          customerId: ctx.state.customerId ?? '',
          amount: total,
          note: `Jharanai subscription · ${litres}L × ${deliveries} deliveries`,
          subscriptionIntent: intent,
        });

        const newCtx: OnboardCtx = { ...slot, daysOfWeek: dow, paymentId: link.paymentId };
        ctx.patchState({ step: 'await_payment', context: newCtx as Record<string, unknown> });

        ctx.send({
          kind: 'template',
          to: phone,
          templateName: TEMPLATES.onboarding_payment_link.name,
          variables: {
            litres: String(litres),
            // The template's {{2}} slot reads "<days>" — we pass the count of
            // delivery days (= deliveries) so "litres × days × rate = total"
            // stays an accurate equation under a non-every-day pattern.
            days: String(deliveries),
            rate: String(rate),
            total: String(total),
          },
        });
        ctx.send({ kind: 'text', to: phone, body: link.url });
        return;
      }

      case 'await_payment': {
        // Primary activation path is the signature-verified webhook (EDG-02).
        // This message-driven path is the idempotent fallback: a customer who
        // returns and says "paid" after the webhook already ran gets a simple
        // reassurance (consumePaymentIntent returns null → no double activate).
        // The dev shortcut is kept for non-production only so local testing
        // works without a real gateway.
        const status = slot.paymentId
          ? await ctx.repos.getPaymentStatus(slot.paymentId)
          : null;
        const devOverride =
          process.env.NODE_ENV !== 'production' && /paid|success|done/i.test(text);
        if (slot.paymentId && (status === 'PAID' || devOverride) && ctx.state.customerId) {
          const intent = await ctx.repos.consumePaymentIntent(slot.paymentId);
          if (intent) {
            await ctx.repos.activateSubscription({
              customerId: ctx.state.customerId,
              litresPerDay: intent.litresPerDay,
              daysOfWeek: intent.daysOfWeek,
              durationDays: intent.durationDays,
            });
            // Capture the door location for last-mile navigation (INT-08: link
            // built from the public pin origin, not the locked-down admin one).
            const tok = await ctx.repos.createLocationToken(ctx.state.customerId);
            const pinUrl = `${pinPageBaseUrl()}/pin/${tok.token}`;
            for (const action of buildActivationActions(intent, phone, slot.name ?? '', pinUrl)) {
              ctx.send(action);
            }
          } else {
            ctx.send({
              kind: 'text',
              to: phone,
              body: 'You’re all set ✅ Your subscription is active.',
            });
          }
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
