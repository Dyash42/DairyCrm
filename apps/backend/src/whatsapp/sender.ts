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

  async send(action: OutboundAction): Promise<{ messageId: string }> {
    try {
      return await getMessagingProvider().send(action);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[wa] send failed', err);
      return { messageId: 'failed' };
    }
  }

  async sendBatch(actions: OutboundAction[]): Promise<void> {
    for (const a of actions) {
      await this.send(a);
    }
  }
}

export const sender = new WhatsAppSender();
