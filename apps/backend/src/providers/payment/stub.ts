/**
 * Stub payment provider — for dev / CI / when no real provider is configured.
 * Returns deterministic fake URLs so the bot, admin, and tests still flow.
 */

import type { PaymentLink, PaymentLinkInput, PaymentProvider } from './types';

export class StubPaymentProvider implements PaymentProvider {
  readonly name = 'stub' as const;
  readonly isConfigured = true;

  async createPaymentLink(input: PaymentLinkInput): Promise<PaymentLink> {
    const id = `plink_stub_${Date.now()}_${input.customerId}`;
    return {
      id,
      url: `https://stub.invalid/pay/${id}`,
      amount: input.amount,
      provider: this.name,
    };
  }

  verifyWebhookSignature(): boolean {
    // Never accept webhooks from the stub provider in any environment.
    return false;
  }
}
