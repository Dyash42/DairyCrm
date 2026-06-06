/**
 * WhatsApp message sender — Meta Cloud API client.
 *
 * Currently a STUB that logs outbound actions and throws if credentials are
 * missing. Wire the real Graph API calls here once Meta verification is done
 * and creds are in .env (see apps/backend/.env.example).
 *
 * Why a stub: lets the conversation engine, flow handlers, and webhook
 * pipeline be built and tested without depending on a live Meta number.
 */

import type { OutboundAction } from './types';

export interface SenderConfig {
  phoneNumberId: string; // META_PHONE_NUMBER_ID
  accessToken: string; // META_ACCESS_TOKEN (system user, permanent)
  graphVersion: string; // META_GRAPH_VERSION, e.g. v20.0
}

function loadConfig(): SenderConfig | null {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  const accessToken = process.env.META_ACCESS_TOKEN;
  const graphVersion = process.env.META_GRAPH_VERSION ?? 'v20.0';
  if (!phoneNumberId || !accessToken) return null;
  return { phoneNumberId, accessToken, graphVersion };
}

/** Configurable logger so callers can pipe into Sentry, pino, etc. */
type Logger = { info: (msg: string, meta?: unknown) => void; warn: (msg: string, meta?: unknown) => void };
const defaultLogger: Logger = {
  info: (m, meta) => {
    // eslint-disable-next-line no-console
    console.log(`[wa] ${m}`, meta ?? '');
  },
  warn: (m, meta) => {
    // eslint-disable-next-line no-console
    console.warn(`[wa] ${m}`, meta ?? '');
  },
};

export class WhatsAppSender {
  private readonly config: SenderConfig | null;

  constructor(
    private readonly log: Logger = defaultLogger,
    configOverride?: SenderConfig | null,
  ) {
    this.config = configOverride ?? loadConfig();
  }

  get isConfigured(): boolean {
    return this.config !== null;
  }

  /**
   * Send one outbound action.
   * Stub behavior: logs the action and returns a fake message id.
   * Real behavior: POSTs to https://graph.facebook.com/{v}/{phoneNumberId}/messages
   */
  async send(action: OutboundAction): Promise<{ messageId: string }> {
    if (!this.config) {
      this.log.warn(
        'sender.send called but META_* env vars are missing — dropping message',
        { action },
      );
      return { messageId: 'stub-no-creds' };
    }

    // TODO: replace with actual fetch() to Meta Graph API.
    // const url = `https://graph.facebook.com/${this.config.graphVersion}/${this.config.phoneNumberId}/messages`;
    // const body = buildMetaPayload(action);
    // const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${this.config.accessToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    // ...

    this.log.info('outbound (stub)', action);
    return { messageId: `stub-${Date.now()}` };
  }

  async sendBatch(actions: OutboundAction[]): Promise<void> {
    for (const a of actions) {
      await this.send(a);
    }
  }
}

export const sender = new WhatsAppSender();
