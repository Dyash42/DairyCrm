/**
 * Support flow — currently scopes "missed delivery" → applies ₹64 credit.
 * Extend later for other categories (wrong qty, late, complaint…).
 */

import type { FlowContext, FlowHandler } from '../types';
import { TEMPLATES } from '../templates';
import { getPrompt } from '../prompts';

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
      const p = getPrompt('support.ask_kind.body');
      ctx.send({
        kind: 'buttons',
        to: phone,
        body: p.body,
        buttons: p.buttons ?? [],
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
          body: getPrompt('support.await_kind.handoff').body,
        });
        ctx.patchState({ flow: null, step: null, context: {} });
        return;
      }

      case 'await_date': {
        // Log the missed-delivery report for ADMIN review — do NOT auto-credit.
        // The old flow credited litres×rate to Customer.balance for ANY claimed
        // date with zero verification — an unbounded self-credit fraud vector.
        // Credits now require manual admin approval.
        if (ctx.state.customerId) {
          await ctx.repos.logSupportTicket({
            customerId: ctx.state.customerId,
            kind: 'missed_delivery',
            note: `Reported missed on ${text}`,
          });
        }
        ctx.send({
          kind: 'text',
          to: phone,
          body: getPrompt('support.missed.logged', { date: text }).body,
        });
        // CUS-10: close the loop immediately instead of parking in
        // 'await_close' (which kept flow='support' and would intercept the
        // customer's next real message). Send the close confirmation once
        // and end the flow right here, matching how other flows reset.
        const cust = await ctx.repos.findCustomerByPhone(phone);
        ctx.send({
          kind: 'template',
          to: phone,
          templateName: TEMPLATES.support_close.name,
          variables: { name: cust?.name ?? 'there' },
        });
        ctx.patchState({ flow: null, step: null, context: {} });
        return;
      }

      default:
        ctx.patchState({ flow: null, step: null, context: {} });
    }
  },
};
