/**
 * Menu flow — what an existing customer sees when they say 'Hi'.
 * If the number is unknown → hand off to onboarding.
 */

import type { FlowContext, FlowHandler } from '../types';
import { TEMPLATES } from '../templates';
import { getPrompt } from '../prompts';

export const menuFlow: FlowHandler = {
  async matches(ctx) {
    // Re-prompt fallback: if the menu is open and a reply reached here, it
    // means no menu option matched (e.g. the customer TYPED 'renew' instead of
    // tapping the list row, or tapped an unknown row). menuFlow is last in the
    // chain, so re-rendering here prevents the silent dead-end where an active
    // 'menu' flow had no matching handler (audit CUS-01).
    if (ctx.state.flow === 'menu') return true;
    // Otherwise only handle "Hi"-style entry messages when no flow is active.
    if (ctx.state.flow !== null) return false;
    if (ctx.message.kind !== 'text') return false;
    const greet = ctx.message.text.trim().toLowerCase();
    return ['hi', 'hello', 'hey', 'namaste', 'menu', 'start'].includes(greet);
  },

  async handle(ctx) {
    const phone = ctx.message.from;
    const customer = await ctx.repos.findCustomerByPhone(phone);

    if (!customer) {
      // New number — kick off onboarding.
      ctx.patchState({ flow: 'onboarding', step: 'ask_name', context: {} });
      ctx.send({
        kind: 'template',
        to: phone,
        templateName: TEMPLATES.onboarding_welcome.name,
      });
      return;
    }

    // Returning customer (fresh greet) OR a re-prompt while the menu is open.
    // Either way (re)render the menu. Body, list button text, section title and
    // row labels are all DB-backed prompts (admin-editable).
    ctx.patchState({
      flow: 'menu',
      step: 'await_choice',
      context: {},
      customerId: customer.id,
    });
    const welcome = getPrompt('menu.returning.welcome', { customerName: customer.name });
    const buttonText = getPrompt('menu.returning.button_text').body;
    const sectionTitle = getPrompt('menu.returning.section_title.manage').body;
    ctx.send({
      kind: 'list',
      to: phone,
      body: welcome.body,
      buttonText,
      sections: [
        {
          title: sectionTitle,
          rows: welcome.rows ?? [],
        },
      ],
    });
  },
};
