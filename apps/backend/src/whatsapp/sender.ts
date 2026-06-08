/**
 * WhatsApp sender — thin wrapper over the messaging provider.
 *
 * Kept for back-compat with the rest of the engine (which imports `sender`).
 * Real Meta/BSP code lives in providers/messaging/.
 */

import { getMessagingProvider } from '../providers/messaging';
import type { OutboundAction } from './types';

export class WhatsAppSender {
  get isConfigured(): boolean {
    return getMessagingProvider().isConfigured;
  }

  /**
   * Send an outbound action. Errors propagate to the caller — the
   * previous implementation wrapped this in try/catch and returned
   * `{ messageId: 'failed' }`, which silently broke every downstream
   * retry/audit path: broadcast `failedCount` always 0, renewal
   * reminders falsely marked SENT, no Sentry breadcrumb. Each call site
   * already wraps the send in its own try/catch when it needs to
   * tolerate failures.
   */
  async send(action: OutboundAction): Promise<{ messageId: string }> {
    return getMessagingProvider().send(action);
  }

  /**
   * Best-effort batch — keeps going on individual failures (still logs
   * each one). Use when you genuinely don't want one bad recipient to
   * abort the rest (e.g. a 500-recipient broadcast). If you DO want
   * fail-fast, call `send()` in a plain for-loop.
   */
  async sendBatch(actions: OutboundAction[]): Promise<{ sent: number; failed: number }> {
    let sent = 0;
    let failed = 0;
    for (const a of actions) {
      try {
        await this.send(a);
        sent += 1;
      } catch (err) {
        failed += 1;
        // eslint-disable-next-line no-console
        console.warn('[wa:batch] send failed', err);
      }
    }
    return { sent, failed };
  }
}

export const sender = new WhatsAppSender();
