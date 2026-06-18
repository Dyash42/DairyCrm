/**
 * EDG-02 — subscription activation on confirmed payment.
 *
 * The payment webhook (signature-verified) finalizes a WhatsApp onboarding/
 * renew the moment the gateway marks the Payment PAID — instead of stranding
 * the customer until they happen to message the bot again. The customer's next
 * inbound message is kept as an idempotent fallback (consumePaymentIntent's
 * compare-and-swap guarantees activation runs exactly once either way).
 */

import { prisma } from '../prisma';
import { loadConfig } from '../config';
import { sender } from './sender';
import { getPrompt } from './prompts';
import { TEMPLATES } from './templates';
import { prismaBotRepos } from './repos';
import type { OutboundAction, SubscriptionIntent } from './types';

/**
 * INT-08: the public origin that serves the customer-facing /pin/<token> page.
 * Kept separate from ADMIN_ORIGIN so the admin app can be locked down without
 * breaking the location-capture link. Resolution: PUBLIC_PIN_BASE_URL →
 * PUBLIC_BASE_URL → ADMIN_ORIGIN (back-compat).
 */
export function pinPageBaseUrl(): string {
  const cfg = loadConfig();
  const base = cfg.PUBLIC_PIN_BASE_URL ?? cfg.PUBLIC_BASE_URL ?? cfg.ADMIN_ORIGIN;
  return base.replace(/\/+$/, '');
}

/**
 * The WhatsApp confirmation a freshly-activated subscription should receive.
 * Pure (no I/O) so both the FSM (via ctx.send) and the webhook (via sender)
 * emit the exact same copy. `pinUrl` is only supplied for onboarding (renew
 * customers already have a door pin).
 */
export function buildActivationActions(
  intent: SubscriptionIntent,
  to: string,
  customerName: string,
  pinUrl?: string,
): OutboundAction[] {
  if (intent.kind === 'renew') {
    return [
      {
        kind: 'template',
        to,
        templateName: TEMPLATES.renew_confirmed.name,
        variables: { name: customerName || 'there' },
      },
    ];
  }
  const actions: OutboundAction[] = [
    {
      kind: 'template',
      to,
      templateName: TEMPLATES.subscription_activated.name,
      variables: { litres_per_day: String(intent.litresPerDay) },
    },
  ];
  if (pinUrl) {
    actions.push({
      kind: 'text',
      to,
      body: getPrompt('location.request', { pin_url: pinUrl }).body,
    });
  }
  return actions;
}

/**
 * Webhook-driven activation. Call after a Payment flips to PAID. Idempotent via
 * consumePaymentIntent's CAS, so it's safe on every webhook retry. Messaging is
 * best-effort — a send failure must never fail the webhook (the subscription is
 * already active and the balance already credited). Returns true if THIS call
 * performed the activation.
 */
export async function activatePaidSubscriptionFromWebhook(
  paymentId: string,
): Promise<boolean> {
  const intent = await prismaBotRepos.consumePaymentIntent(paymentId);
  if (!intent) return false; // no intent, or already activated by another path

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { customer: true },
  });
  if (!payment) return false;

  await prismaBotRepos.activateSubscription({
    customerId: payment.customerId,
    litresPerDay: intent.litresPerDay,
    daysOfWeek: intent.daysOfWeek,
    durationDays: intent.durationDays,
  });

  try {
    let pinUrl: string | undefined;
    if (intent.kind === 'onboarding') {
      const tok = await prismaBotRepos.createLocationToken(payment.customerId);
      pinUrl = `${pinPageBaseUrl()}/pin/${tok.token}`;
    }
    const actions = buildActivationActions(
      intent,
      payment.customer.phone,
      payment.customer.name,
      pinUrl,
    );
    await sender.sendBatch(actions);
  } catch {
    // Swallow — sendBatch already logs each failure; activation stands.
  }
  return true;
}
