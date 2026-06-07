/**
 * Stub messaging provider — logs outbound actions instead of sending.
 *
 * Webhook signature verification PASSES in non-production so dev can
 * curl the webhook without computing HMAC. Production fails closed.
 */

import { loadConfig } from '../../config';
import type { OutboundAction } from '../../whatsapp/types';
import type { MessagingProvider } from './types';

export class StubMessagingProvider implements MessagingProvider {
  readonly name = 'stub' as const;
  readonly isConfigured = true;

  async send(action: OutboundAction): Promise<{ messageId: string }> {
    // eslint-disable-next-line no-console
    console.log('[messaging:stub] outbound', action);
    return { messageId: `stub-${Date.now()}` };
  }

  verifyWebhookSignature(): boolean {
    return loadConfig().NODE_ENV !== 'production';
  }
}
