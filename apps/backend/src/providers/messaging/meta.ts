/**
 * Meta WhatsApp Cloud API implementation.
 *
 * - Real POST to graph.facebook.com when META_PHONE_NUMBER_ID +
 *   META_ACCESS_TOKEN are set.
 * - Webhook signature: HMAC-SHA256 of raw body with META_APP_SECRET,
 *   compared against `X-Hub-Signature-256: sha256=<hex>`.
 */

import crypto from 'node:crypto';

import { loadConfig } from '../../config';
import { DEFAULT_TEMPLATE_LANGUAGE } from '../../constants';
import { TEMPLATES } from '../../whatsapp/templates';
import type { OutboundAction } from '../../whatsapp/types';
import type { MessagingProvider } from './types';

export class MetaMessagingProvider implements MessagingProvider {
  readonly name = 'meta' as const;

  get isConfigured(): boolean {
    const c = loadConfig();
    return Boolean(c.META_PHONE_NUMBER_ID && c.META_ACCESS_TOKEN);
  }

  async send(action: OutboundAction): Promise<{ messageId: string }> {
    const c = loadConfig();
    if (!c.META_PHONE_NUMBER_ID || !c.META_ACCESS_TOKEN) {
      throw new Error('Meta messaging not configured');
    }
    const url = `https://graph.facebook.com/${c.META_GRAPH_VERSION}/${c.META_PHONE_NUMBER_ID}/messages`;
    const payload = buildMetaPayload(action);
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${c.META_ACCESS_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id: string }>;
      error?: { message: string };
    };
    if (!res.ok || data.error) {
      throw new Error(`Meta send failed: ${data.error?.message ?? `HTTP ${res.status}`}`);
    }
    return { messageId: data.messages?.[0]?.id ?? 'unknown' };
  }

  verifyWebhookSignature(rawBody: string, signature: string | undefined): boolean {
    const c = loadConfig();
    if (!c.META_APP_SECRET) {
      // Without a secret we have NOTHING to verify against. The previous
      // "NODE_ENV !== production" gate quietly accepted unsigned webhooks
      // in staging — which is internet-exposed and lets anyone inject
      // events. Require an explicit opt-in flag so the local-dev workflow
      // (no Meta subscription at all) still works, but every other env
      // hard-rejects until META_APP_SECRET is set.
      if (c.ALLOW_UNSIGNED_WEBHOOK === '1' && c.NODE_ENV !== 'production') return true;
      return false;
    }
    if (!signature) return false;
    const expected = `sha256=${crypto
      .createHmac('sha256', c.META_APP_SECRET)
      .update(rawBody, 'utf8')
      .digest('hex')}`;
    if (expected.length !== signature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }
}

/** Map our typed OutboundAction → Meta payload. */
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
          language: { code: DEFAULT_TEMPLATE_LANGUAGE },
          components: action.variables
            ? [
                {
                  type: 'body',
                  parameters: orderTemplateParameters(
                    action.templateName,
                    action.variables,
                  ).map((text) => ({
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

/**
 * Order body parameters by the template's DECLARED slot array
 * (TEMPLATES[name].variables), so {{1}},{{2}},... always map to the slots the
 * approved Meta template expects — regardless of the key-insertion order of the
 * variables object built at the call site. Mapping by Object.values insertion
 * order silently transposes numbers in billing-facing messages (INT-05).
 *
 * If the template is unknown or declares no slots, fall back to insertion order
 * (preserves prior behavior for ad-hoc/unregistered templates). When the
 * declared order is known, a missing slot is a wiring bug → throw at send time
 * so we fail loud instead of sending wrong numbers.
 */
function orderTemplateParameters(
  templateName: string,
  variables: Record<string, string>,
): string[] {
  const template = (TEMPLATES as Record<string, { variables: readonly string[] }>)[
    templateName
  ];
  const slots = template?.variables;
  if (!slots || slots.length === 0) {
    // Unknown template or no declared slots — preserve today's behavior.
    return Object.values(variables);
  }
  return slots.map((slot) => {
    const value = variables[slot];
    if (value === undefined) {
      throw new Error(
        `Missing template variable "${slot}" for template "${templateName}"`,
      );
    }
    return value;
  });
}
