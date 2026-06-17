/**
 * Renew flow — returning customer extends subscription.
 *
 * Steps:
 *   menu(await_choice) → ask_days → quote_pay → await_payment → done
 *
 * Triggered from the menu when user picks "Renew subscription".
 */

import type { FlowContext, FlowHandler } from '../types';
import { TEMPLATES } from '../templates';
import { getPrompt } from '../prompts';
import {
  DEFAULT_RATE_PER_LITRE_INR,
  DEFAULT_SUBSCRIPTION_DAYS,
} from '../../constants';

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
        const dow = parseDaysOfWeek(text);
        // Prefer real subscription data over slot defaults
        const sub = ctx.state.customerId
          ? await ctx.repos.getActiveSubscription(ctx.state.customerId)
          : null;
        const litres = sub?.litresPerDay ?? slot.litresPerDay ?? 1;
        const rate = sub?.ratePerLitre ?? DEFAULT_RATE_PER_LITRE_INR;
        const duration = DEFAULT_SUBSCRIPTION_DAYS;
        const deliveries = countDeliveries(dow, duration);
        const total = Math.round(deliveries * litres * rate);

        const link = await ctx.repos.createPaymentLink({
          customerId: ctx.state.customerId ?? '',
          amount: total,
          note: `Jharanai renew · ${litres}L × ${deliveries} deliveries`,
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
            day_pattern: text,
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
        // Same payment-verified gate as onboarding: activate only on a
        // webhook-confirmed PAID payment (dev shortcut in non-prod only).
        const status = slot.paymentId
          ? await ctx.repos.getPaymentStatus(slot.paymentId)
          : null;
        const devOverride =
          process.env.NODE_ENV !== 'production' && /paid|success|done/i.test(text);
        if ((status === 'PAID' || devOverride) && ctx.state.customerId) {
          await ctx.repos.activateSubscription({
            customerId: ctx.state.customerId,
            litresPerDay: slot.litresPerDay ?? 1,
            daysOfWeek: slot.daysOfWeek ?? [1, 2, 3, 4, 5, 6],
            durationDays: slot.durationDays ?? 30,
          });
          const cust = await ctx.repos.findCustomerByPhone(phone);
          ctx.send({
            kind: 'template',
            to: phone,
            templateName: TEMPLATES.renew_confirmed.name,
            variables: { name: cust?.name ?? 'there' },
          });
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

function parseDaysOfWeek(text: string): number[] {
  const lower = text.toLowerCase();
  if (lower.includes('all') || lower.includes('every')) return [0, 1, 2, 3, 4, 5, 6];
  if (lower.includes('mon-sat') || lower.includes('mon–sat')) return [1, 2, 3, 4, 5, 6];
  if (lower.includes('weekday')) return [1, 2, 3, 4, 5];
  if (lower.includes('weekend')) return [0, 6];
  return [1, 2, 3, 4, 5, 6]; // sensible default
}

function countDeliveries(daysOfWeek: number[], durationDays: number): number {
  // Approx: number of matching weekdays in the next `durationDays` days.
  const weekRatio = daysOfWeek.length / 7;
  return Math.round(durationDays * weekRatio);
}
