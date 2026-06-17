/**
 * Location flow — a shared WhatsApp location updates the customer's door pin.
 *
 * This handles BOTH paths from onboarding's location request:
 *   - "I'm home" → the customer shares their current location now.
 *   - "share later" → they send a location whenever they're home.
 * Because it matches on message kind (not flow state), it works from any
 * point in the conversation for a known customer.
 */

import type { FlowHandler } from '../types';
import { getPrompt } from '../prompts';

export const locationFlow: FlowHandler = {
  matches(ctx) {
    return ctx.message.kind === 'location';
  },

  async handle(ctx) {
    if (ctx.message.kind !== 'location') return;
    const phone = ctx.message.from;
    const customerId =
      ctx.state.customerId ?? (await ctx.repos.findCustomerByPhone(phone))?.id;
    if (!customerId) return; // unknown number — nothing to attach the pin to

    await ctx.repos.saveCustomerLocation({
      customerId,
      lat: ctx.message.latitude,
      lng: ctx.message.longitude,
    });
    ctx.send({ kind: 'text', to: phone, body: getPrompt('location.saved').body });

    // If a flow was still open (e.g. just finished onboarding), close it.
    if (ctx.state.flow) ctx.patchState({ flow: null, step: null, context: {} });
  },
};
