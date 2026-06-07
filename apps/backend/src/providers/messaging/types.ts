/**
 * Messaging provider contract.
 *
 * Currently used for outbound WhatsApp messages and webhook signature
 * verification. Future BSPs (AiSensy, Wati, Interakt, Gupshup) implement
 * the same interface — switching is a 1-env-var change.
 */

import type { OutboundAction } from '../../whatsapp/types';

export type MessagingProviderName = 'meta' | 'stub';

export interface MessagingProvider {
  readonly name: MessagingProviderName;
  readonly isConfigured: boolean;
  send(action: OutboundAction): Promise<{ messageId: string }>;
  /** Webhook signature verification — provider-specific HMAC scheme. */
  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean;
}
