/**
 * Menu flow — what an existing customer sees when they say 'Hi'.
 * If the number is unknown → hand off to onboarding.
 */

import type { FlowContext, FlowHandler } from '../types';
import { TEMPLATES } from '../templates';

export const menuFlow: FlowHandler = {
  async matches(ctx) {
    // Only handle "Hi"-style entry messages when no flow is active.
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

    // Returning customer — show menu.
    ctx.patchState({
      flow: 'menu',
      step: 'await_choice',
      context: {},
      customerId: customer.id,
    });
    ctx.send({
      kind: 'list',
      to: phone,
      body: `Welcome back, ${customer.name}! 👋 What would you like to do today?`,
      buttonText: 'Choose an option',
      sections: [
        {
          title: 'Manage your subscription',
          rows: [
            { id: 'renew', title: 'Renew subscription' },
            { id: 'pause', title: 'Pause deliveries' },
            { id: 'resume', title: 'Resume' },
            { id: 'support', title: 'Support' },
          ],
        },
      ],
    });
  },
};
