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

const RATE_PER_LITRE = 64;

interface RenewCtx {
  litresPerDay?: number;
  daysOfWeek?: number[];
  durationDays?: number;
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
      // Just entered renew. Start asking for days.
      ctx.patchState({ flow: 'renew', step: 'ask_days', context: {} });
      ctx.send({
        kind: 'template',
        to: phone,
        templateName: TEMPLATES.renew_ask_days.name,
        variables: { litres_per_day: '1' /* TODO: pull real value from repo */ },
      });
      return;
    }

    const slot = ctx.state.context as RenewCtx;

    if (ctx.message.kind !== 'text' && ctx.message.kind !== 'button') return;
    const text = ctx.message.kind === 'text' ? ctx.message.text.trim() : ctx.message.title;

    switch (ctx.state.step) {
      case 'ask_days': {
        const dow = parseDaysOfWeek(text);
        const litres = 1; // TODO: pull from current subscription
        const duration = 30; // default to 30-day cycle
        const deliveries = countDeliveries(dow, duration);
        const total = Math.round(deliveries * litres * RATE_PER_LITRE);

        ctx.patchState({
          step: 'await_payment',
          context: { ...slot, litresPerDay: litres, daysOfWeek: dow, durationDays: duration } as Record<string, unknown>,
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
            rate: String(RATE_PER_LITRE),
            total: String(total),
          },
        });

        const link = await ctx.repos.createPaymentLink({
          customerId: ctx.state.customerId ?? '',
          amount: total,
          note: `Jharanai renew · ${litres}L × ${deliveries} deliveries`,
        });
        ctx.send({ kind: 'text', to: phone, body: link.url });
        return;
      }

      case 'await_payment': {
        if (/paid|success|done/i.test(text) && ctx.state.customerId) {
          await ctx.repos.activateSubscription({
            customerId: ctx.state.customerId,
            litresPerDay: slot.litresPerDay ?? 1,
            daysOfWeek: slot.daysOfWeek ?? [1, 2, 3, 4, 5, 6],
            durationDays: slot.durationDays ?? 30,
          });
          ctx.send({
            kind: 'template',
            to: phone,
            templateName: TEMPLATES.renew_confirmed.name,
            variables: { name: 'there' }, // TODO: pull from customer
          });
          ctx.patchState({ flow: null, step: null, context: {} });
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
