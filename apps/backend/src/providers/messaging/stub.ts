/**
 * Stub messaging provider — logs outbound actions instead of sending.
 *
 * Webhook signature verification PASSES in non-production so dev can
 * curl the webhook without computing HMAC. Production fails closed.
 *
 * Also exposes a capture API: when a sink function is registered, every
 * send is recorded against it. Used by the admin bot tester to render
 * outbound messages as chat bubbles instead of fishing them out of logs.
 */

import { loadConfig } from '../../config';
import type { OutboundAction } from '../../whatsapp/types';
import type { MessagingProvider } from './types';

/** Sink that observes every outbound action. */
export type StubCaptureSink = (action: OutboundAction) => void;

let captureSink: StubCaptureSink | null = null;

/** Register a one-shot capture sink. Returns a disposer. */
export function startStubCapture(sink: StubCaptureSink): () => void {
  captureSink = sink;
  return () => {
    if (captureSink === sink) captureSink = null;
  };
}

export class StubMessagingProvider implements MessagingProvider {
  readonly name = 'stub' as const;
  readonly isConfigured = true;

  async send(action: OutboundAction): Promise<{ messageId: string }> {
    if (captureSink) {
      try {
        captureSink(action);
      } catch {
        // never let a sink failure break the engine
      }
    }
    // eslint-disable-next-line no-console
    console.log('[messaging:stub] outbound', action);
    return { messageId: `stub-${Date.now()}` };
  }

  verifyWebhookSignature(): boolean {
    return loadConfig().NODE_ENV !== 'production';
  }
}
