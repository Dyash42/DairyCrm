/**
 * Support flow — currently scopes "missed delivery" → applies ₹64 credit.
 * Extend later for other categories (wrong qty, late, complaint…).
 */

import type { FlowContext, FlowHandler } from '../types';
import { TEMPLATES } from '../templates';
import { DEFAULT_RATE_PER_LITRE_INR } from '../../constants';

interface SupportCtx {
  kind?: 'missed' | 'other';
}

export const supportFlow: FlowHandler = {
  async matches(ctx) {
    if (
      ctx.state.flow === 'menu' &&
      ctx.message.kind === 'list' &&
      ctx.message.rowId === 'support'
    ) {
      return true;
    }
    return ctx.state.flow === 'support';
  },

  async handle(ctx) {
    const phone = ctx.message.from;

    if (ctx.state.flow === 'menu') {
      ctx.patchState({ flow: 'support', step: 'await_kind', context: {} });
      ctx.send({
        kind: 'buttons',
        to: phone,
        body: 'How can we help you today?',
        buttons: [
          { id: 'missed', title: 'Missed delivery' },
          { id: 'other', title: 'Other' },
        ],
      });
      return;
    }

    if (ctx.message.kind !== 'text' && ctx.message.kind !== 'button') return;
    const text =
      ctx.message.kind === 'text' ? ctx.message.text.trim() : ctx.message.title;
    const slot = ctx.state.context as SupportCtx;

    switch (ctx.state.step) {
      case 'await_kind': {
        if (ctx.message.kind === 'button' && ctx.message.payload === 'missed') {
          ctx.patchState({
            step: 'await_date',
            context: { ...slot, kind: 'missed' } as Record<string, unknown>,
          });
          ctx.send({
            kind: 'template',
            to: phone,
            templateName: TEMPLATES.support_missed_ask_date.name,
          });
          return;
        }
        ctx.send({
          kind: 'text',
          to: phone,
          body: 'Got it — a teammate will reach out shortly.',
        });
        ctx.patchState({ flow: null, step: null, context: {} });
        return;
      }

      case 'await_date': {
        // Credit one day's worth, using the customer's real rate when available.
        const sub = ctx.state.customerId
          ? await ctx.repos.getActiveSubscription(ctx.state.customerId)
          : null;
        const litres = sub?.litresPerDay ?? 1;
        const rate = sub?.ratePerLitre ?? DEFAULT_RATE_PER_LITRE_INR;
        const credit = Math.round(litres * rate);
        if (ctx.state.customerId) {
          await ctx.repos.logSupportTicket({
            customerId: ctx.state.customerId,
            kind: 'missed_delivery',
            note: `Reported missed on ${text}`,
            creditApplied: credit,
          });
        }
        ctx.send({
          kind: 'template',
          to: phone,
          templateName: TEMPLATES.support_credit_applied.name,
          variables: { credit_amount: String(credit), date: text },
        });
        ctx.patchState({ step: 'await_close', context: {} });
        return;
      }

      case 'await_close': {
        // Any reply closes the loop.
        ctx.send({
          kind: 'template',
          to: phone,
          templateName: TEMPLATES.support_close.name,
          variables: { name: 'there' },
        });
        ctx.patchState({ flow: null, step: null, context: {} });
        return;
      }

      default:
        ctx.patchState({ flow: null, step: null, context: {} });
    }
  },
};
