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
// BAC-03: use the EXACT calendar delivery counter (same one the scheduler/
// materializer uses) instead of the round(duration*dow/7) approximation, so
// the charged amount equals the deliveries actually delivered.
import {
  countDeliveriesInRange,
  type WeekdayNumber,
} from '../../services/subscription-calc';
import { startOfBusinessDayUTC } from '../../utils/dates';

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

/**
 * Parse the customer's free-text day pattern into a sorted weekday list.
 *
 * CUS-07: returns `null` for unrecognized input so the caller can re-prompt
 * instead of silently defaulting to Mon–Sat and charging the wrong amount.
 */
function parseDaysOfWeek(text: string): WeekdayNumber[] | null {
  const lower = text.toLowerCase();
  if (lower.includes('all') || lower.includes('every') || lower.includes('daily')) {
    return [0, 1, 2, 3, 4, 5, 6];
  }
  if (lower.includes('mon-sat') || lower.includes('mon–sat') || lower.includes('mon to sat')) {
    return [1, 2, 3, 4, 5, 6];
  }
  if (lower.includes('weekday')) return [1, 2, 3, 4, 5];
  if (lower.includes('weekend')) return [0, 6];
  return null; // unparseable — caller re-prompts
}

/**
 * CUS-07: render a normalized human label for a parsed weekday list, so the
 * renew_quote template shows a clean pattern ("Every day", "Mon–Sat",
 * "Weekdays", "Weekends") rather than echoing the raw user text. Falls back
 * to a short comma list of weekday abbreviations for any other combination.
 */
function formatDayPattern(daysOfWeek: WeekdayNumber[]): string {
  const sorted = [...daysOfWeek].sort((a, b) => a - b);
  const key = sorted.join(',');
  if (key === '0,1,2,3,4,5,6') return 'Every day';
  if (key === '1,2,3,4,5,6') return 'Mon–Sat';
  if (key === '1,2,3,4,5') return 'Weekdays';
  if (key === '0,6') return 'Weekends';
  const NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  return sorted.map((d) => NAMES[d]).join(', ');
}
