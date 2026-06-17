/**
 * Stub messaging provider — logs outbound actions instead of sending.
 *
 * Webhook signature verification FAILS CLOSED. It only accepts an unsigned
 * webhook when the operator has explicitly opted in via ALLOW_UNSIGNED_WEBHOOK=1
 * AND the environment is non-production — mirroring MetaMessagingProvider and
 * the payment stub. Previously it accepted ANY unsigned body in any
 * non-production env, so an internet-reachable staging box could have its
 * conversation FSM driven by forged inbound messages (audit SEC-01/EDG-07).
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
    const cfg = loadConfig();
    // Fail closed: never accept unsigned webhooks in production, and only in
    // dev/staging when explicitly opted in. This matches the Meta provider's
    // ALLOW_UNSIGNED_WEBHOOK gate so the stub can't be a softer back door.
    return cfg.NODE_ENV !== 'production' && cfg.ALLOW_UNSIGNED_WEBHOOK === '1';
  }
}
