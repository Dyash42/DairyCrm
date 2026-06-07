/**
 * Resume flow — customer ends a pause early.
 */

import type { FlowContext, FlowHandler } from '../types';
import { TEMPLATES } from '../templates';

export const resumeFlow: FlowHandler = {
  async matches(ctx) {
    if (
      ctx.state.flow === 'menu' &&
      ctx.message.kind === 'list' &&
      ctx.message.rowId === 'resume'
    ) {
      return true;
    }
    return ctx.state.flow === 'resume';
  },

  async handle(ctx) {
    const phone = ctx.message.from;

    if (ctx.state.flow === 'menu') {
      const pause = ctx.state.customerId
        ? await ctx.repos.getActivePause(ctx.state.customerId)
        : null;
      const endLabel = pause
        ? pause.endDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        : 'today';
      ctx.patchState({ flow: 'resume', step: 'await_choice', context: {} });
      ctx.send({
        kind: 'buttons',
        to: phone,
        body: `Your subscription is currently paused until ${endLabel}. Would you like to resume earlier?`,
        buttons: [
          { id: 'resume_tomorrow', title: 'Resume from tomorrow' },
          { id: 'resume_cancel', title: 'Keep pause' },
        ],
      });
      return;
    }

    if (ctx.message.kind !== 'button') return;

    if (ctx.message.payload === 'resume_tomorrow' && ctx.state.customerId) {
      const sub = await ctx.repos.getActiveSubscription(ctx.state.customerId);
      const litres = sub?.litresPerDay ?? 1;
      await ctx.repos.resumeSubscription(ctx.state.customerId);
      ctx.send({
        kind: 'template',
        to: phone,
        templateName: TEMPLATES.resume_done.name,
        variables: { date: 'tomorrow', litres_per_day: String(litres) },
      });
    } else {
      ctx.send({ kind: 'text', to: phone, body: 'No problem, your pause stays as is.' });
    }
    ctx.patchState({ flow: null, step: null, context: {} });
  },
};
