/**
 * WhatsApp message sender — Meta Cloud API client.
 *
 * Behavior depends on env:
 *   - META_PHONE_NUMBER_ID + META_ACCESS_TOKEN set → real POST to Meta
 *   - either missing → logs the action and returns stub id (dev-friendly)
 *
 * Production hardening still to add:
 *   - retries with exponential backoff
 *   - rate-limit-aware throttling
 *   - cost logging (WhatsAppLog.costInr)
 */

import { loadConfig } from '../config';
import type { OutboundAction } from './types';

type Logger = {
  info: (msg: string, meta?: unknown) => void;
  warn: (msg: string, meta?: unknown) => void;
};

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

interface MetaSendResponse {
  messages?: Array<{ id: string }>;
  error?: { message: string; code: number };
}

export class WhatsAppSender {
  constructor(
    private readonly log: Logger = defaultLogger,
    /** Test override: pass null to force stub mode. */
    private readonly testOverride?: { phoneNumberId: string; accessToken: string; graphVersion: string } | null,
  ) {}

  private getCreds():
    | { phoneNumberId: string; accessToken: string; graphVersion: string }
    | null {
    if (this.testOverride !== undefined) return this.testOverride;
    const c = loadConfig();
    if (!c.META_PHONE_NUMBER_ID || !c.META_ACCESS_TOKEN) return null;
    return {
      phoneNumberId: c.META_PHONE_NUMBER_ID,
      accessToken: c.META_ACCESS_TOKEN,
      graphVersion: c.META_GRAPH_VERSION,
    };
  }

  get isConfigured(): boolean {
    return this.getCreds() !== null;
  }

  async send(action: OutboundAction): Promise<{ messageId: string }> {
    const creds = this.getCreds();
    if (!creds) {
      this.log.warn('outbound (stub — no creds)', action);
      return { messageId: 'stub-no-creds' };
    }

    const url = `https://graph.facebook.com/${creds.graphVersion}/${creds.phoneNumberId}/messages`;
    const payload = buildMetaPayload(action);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${creds.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = (await res.json().catch(() => ({}))) as MetaSendResponse;
    if (!res.ok || data.error) {
      const msg = data.error?.message ?? `HTTP ${res.status}`;
      this.log.warn('Meta send failed', { msg, action });
      throw new Error(`Meta send failed: ${msg}`);
    }
    return { messageId: data.messages?.[0]?.id ?? 'unknown' };
  }

  async sendBatch(actions: OutboundAction[]): Promise<void> {
    for (const a of actions) {
      try {
        await this.send(a);
      } catch (err) {
        this.log.warn('send error (continuing batch)', { err: String(err) });
      }
    }
  }
}

/**
 * Map our typed OutboundAction to Meta's JSON payload shape.
 * See https://developers.facebook.com/docs/whatsapp/cloud-api/reference/messages
 */
function buildMetaPayload(action: OutboundAction): Record<string, unknown> {
  switch (action.kind) {
    case 'text':
      return {
        messaging_product: 'whatsapp',
        to: action.to,
        type: 'text',
        text: { body: action.body, preview_url: false },
      };
    case 'image':
      return {
        messaging_product: 'whatsapp',
        to: action.to,
        type: 'image',
        image: { link: action.mediaUrl, caption: action.caption },
      };
    case 'template':
      return {
        messaging_product: 'whatsapp',
        to: action.to,
        type: 'template',
        template: {
          name: action.templateName,
          language: { code: 'en' },
          components: action.variables
            ? [
                {
                  type: 'body',
                  parameters: Object.values(action.variables).map((text) => ({
                    type: 'text',
                    text,
                  })),
                },
              ]
            : undefined,
        },
      };
    case 'buttons':
      return {
        messaging_product: 'whatsapp',
        to: action.to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: action.body },
          action: {
            buttons: action.buttons.map((b) => ({
              type: 'reply',
              reply: { id: b.id, title: b.title.slice(0, 20) },
            })),
          },
        },
      };
    case 'list':
      return {
        messaging_product: 'whatsapp',
        to: action.to,
        type: 'interactive',
        interactive: {
          type: 'list',
          body: { text: action.body },
          action: {
            button: action.buttonText.slice(0, 20),
            sections: action.sections.map((s) => ({
              title: s.title.slice(0, 24),
              rows: s.rows.map((r) => ({
                id: r.id,
                title: r.title.slice(0, 24),
                description: r.description?.slice(0, 72),
              })),
            })),
          },
        },
      };
  }
}

export const sender = new WhatsAppSender();
