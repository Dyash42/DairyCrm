/**
 * Resume flow — customer ends a pause early.
 */

import type { FlowContext, FlowHandler } from '../types';
import { TEMPLATES } from '../templates';
import { getPrompt } from '../prompts';

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
      const p = getPrompt('resume.ask_choice.body', { endLabel });
      ctx.send({
        kind: 'buttons',
        to: phone,
        body: p.body,
        buttons: p.buttons ?? [],
      });
      return;
    }

    if (ctx.message.kind !== 'button') return;

    if (ctx.message.payload === 'resume_tomorrow' && ctx.state.customerId) {
      // Don't send a false "deliveries resume tomorrow" when nothing is paused
      // (audit CUS-04): resumeSubscription silently no-ops if there's no PAUSED
      // sub, so the customer would get a misleading confirmation.
      const pause = await ctx.repos.getActivePause(ctx.state.customerId);
      if (!pause) {
        ctx.send({
          kind: 'text',
          to: phone,
          body: 'Your deliveries are already running — there is no active pause to resume. 🥛',
        });
        ctx.patchState({ flow: null, step: null, context: {} });
        return;
      }
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
      ctx.send({ kind: 'text', to: phone, body: getPrompt('resume.decline.body').body });
    }
    ctx.patchState({ flow: null, step: null, context: {} });
  },
};
