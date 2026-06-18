/**
 * Renew flow — returning customer extends subscription.
 *
 * Steps:
 *   menu(await_choice) → ask_days → quote_pay → await_payment → done
 *
 * Triggered from the menu when user picks "Renew subscription".
 */

import type { FlowContext, FlowHandler, SubscriptionIntent } from '../types';
import { TEMPLATES } from '../templates';
import { getPrompt } from '../prompts';
import {
  DEFAULT_RATE_PER_LITRE_INR,
  DEFAULT_SUBSCRIPTION_DAYS,
} from '../../constants';
// BAC-03: use the EXACT calendar delivery counter (same one the scheduler/
// materializer uses) instead of the round(duration*dow/7) approximation, so
// the charged amount equals the deliveries actually delivered.
import { countDeliveriesInRange } from '../../services/subscription-calc';
import { startOfBusinessDayUTC } from '../../utils/dates';
// Shared with onboarding so both money flows parse/label day patterns identically.
import { parseDaysOfWeek, formatDayPattern } from '../day-pattern';
import { buildActivationActions } from '../activation';

interface RenewCtx {
  litresPerDay?: number;
  daysOfWeek?: number[];
  durationDays?: number;
  /** Local Payment row id for the issued link — used to verify payment. */
  paymentId?: string;
}

export const renewFlow: FlowHandler = {
  async matches(ctx) {
    // Triggered by menu list-reply "renew".
    if (
      ctx.state.flow === 'menu' &&
      ctx.message.kind === 'list' &&
      ctx.message.rowId === 'renew'
    ) {
      return true;
    }
    return ctx.state.flow === 'renew';
  },

  async handle(ctx) {
    const phone = ctx.message.from;

    if (ctx.state.flow === 'menu') {
      // Pull real subscription so we don't quote stale or hard-coded litres.
      const sub = ctx.state.customerId
        ? await ctx.repos.getActiveSubscription(ctx.state.customerId)
        : null;
      const litres = sub?.litresPerDay ?? 1;
      ctx.patchState({
        flow: 'renew',
        step: 'ask_days',
        context: { litresPerDay: litres } as Record<string, unknown>,
      });
      ctx.send({
        kind: 'template',
        to: phone,
        templateName: TEMPLATES.renew_ask_days.name,
        variables: { litres_per_day: String(litres) },
      });
      return;
    }

    const slot = ctx.state.context as RenewCtx;

    if (ctx.message.kind !== 'text' && ctx.message.kind !== 'button') return;
    const text = ctx.message.kind === 'text' ? ctx.message.text.trim() : ctx.message.title;

    switch (ctx.state.step) {
      case 'ask_days': {
        // CUS-07: distinguish "unparseable" from a valid pattern. On unknown
        // input we re-prompt instead of silently defaulting to Mon–Sat (which
        // would charge the wrong amount for what the customer actually meant).
        const dow = parseDaysOfWeek(text);
        if (!dow) {
          ctx.send({
            kind: 'template',
            to: phone,
            templateName: TEMPLATES.renew_ask_days.name,
            variables: { litres_per_day: String(slot.litresPerDay ?? 1) },
          });
          return;
        }
        // Prefer real subscription data over slot defaults
        const sub = ctx.state.customerId
          ? await ctx.repos.getActiveSubscription(ctx.state.customerId)
          : null;
        const litres = sub?.litresPerDay ?? slot.litresPerDay ?? 1;
        const rate = sub?.ratePerLitre ?? DEFAULT_RATE_PER_LITRE_INR;
        const duration = DEFAULT_SUBSCRIPTION_DAYS;
        // BAC-03: exact calendar count over the real renewal window
        // (startDate=startOfBusinessDayUTC(today) .. +duration days), so the
        // amount charged equals the deliveries the scheduler will produce.
        const startDate = startOfBusinessDayUTC();
        const deliveries = countDeliveriesInRange(startDate, duration, dow);
        const total = Math.round(deliveries * litres * rate);

        // EDG-02: carry the renew intent so the webhook auto-activates on PAID.
        const intent: SubscriptionIntent = {
          kind: 'renew',
          litresPerDay: litres,
          daysOfWeek: dow,
          durationDays: duration,
        };
        const link = await ctx.repos.createPaymentLink({
          customerId: ctx.state.customerId ?? '',
          amount: total,
          note: `Jharanai renew · ${litres}L × ${deliveries} deliveries`,
          subscriptionIntent: intent,
        });

        ctx.patchState({
          step: 'await_payment',
          context: {
            ...slot,
            litresPerDay: litres,
            daysOfWeek: dow,
            durationDays: duration,
            paymentId: link.paymentId,
          } as Record<string, unknown>,
        });

        ctx.send({
          kind: 'template',
          to: phone,
          templateName: TEMPLATES.renew_quote.name,
          variables: {
            // CUS-07: normalized human label from the PARSED days, not the raw
            // user text — so the quote reads "Mon–Sat"/"Every day" etc.
            day_pattern: formatDayPattern(dow),
            duration_days: String(duration),
            delivery_count: String(deliveries),
            litres_per_day: String(litres),
            rate: String(rate),
            total: String(total),
          },
        });
        ctx.send({ kind: 'text', to: phone, body: link.url });
        return;
      }

      case 'await_payment': {
        // Primary activation is the signature-verified webhook (EDG-02); this
        // is the idempotent message-driven fallback. consumePaymentIntent's CAS
        // guarantees the renewal is applied exactly once across both paths so a
        // returning "paid" message can't double-extend the subscription. Dev
        // shortcut in non-prod only.
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
            const cust = await ctx.repos.findCustomerByPhone(phone);
            for (const action of buildActivationActions(intent, phone, cust?.name ?? 'there')) {
              ctx.send(action);
            }
          } else {
            ctx.send({
              kind: 'text',
              to: phone,
              body: 'You’re all set ✅ Your subscription is renewed.',
            });
          }
          ctx.patchState({ flow: null, step: null, context: {} });
        } else {
          ctx.send({ kind: 'text', to: phone, body: getPrompt('payment.not_received').body });
        }
        return;
      }

      default:
        ctx.patchState({ flow: null, step: null, context: {} });
    }
  },
};
