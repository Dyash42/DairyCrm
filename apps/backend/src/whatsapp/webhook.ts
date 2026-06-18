/**
 * Meta WhatsApp webhook receiver.
 *
 * Meta requires:
 *   GET  /whatsapp/webhook  — verification handshake (returns hub.challenge if hub.verify_token matches)
 *   POST /whatsapp/webhook  — event payload (must respond with 200 quickly; process async)
 *
 * This file is framework-agnostic. Wire it up to NestJS / Fastify / Express
 * with two route handlers calling `verifyWebhook` and `handleWebhook`.
 */

import crypto from 'node:crypto';

import { prisma } from '../prisma';
import { engine } from './engine';
import type { InboundMessage } from './types';

// ---------- GET — verification ----------

/** Constant-time string comparison — no early return on first mismatch. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
  } catch {
    return false;
  }
}

export interface VerifyParams {
  mode: string | undefined;
  token: string | undefined;
  challenge: string | undefined;
}

export function verifyWebhook(
  params: VerifyParams,
): { status: 200; body: string } | { status: 403; body: string } {
  const expected = process.env.META_VERIFY_TOKEN;
  if (
    params.mode === 'subscribe' &&
    expected &&
    params.token !== undefined &&
    safeEqual(params.token, expected) &&
    params.challenge
  ) {
    return { status: 200, body: params.challenge };
  }
  return { status: 403, body: 'forbidden' };
}

// ---------- POST — events ----------

/**
 * Meta event payload — see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/payload-examples
 * We only model the shapes we actually consume.
 */
interface MetaWebhookEvent {
  object: 'whatsapp_business_account';
  entry?: Array<{
    id: string;
    changes?: Array<{
      value: {
        messaging_product: 'whatsapp';
        metadata?: { phone_number_id: string };
        messages?: Array<MetaIncomingMessage>;
        statuses?: Array<MetaDeliveryStatus>;
      };
      field: 'messages';
    }>;
  }>;
}

interface MetaIncomingMessage {
  from: string; // E.164 phone
  id: string;
  timestamp: string; // unix seconds, as string
  type: 'text' | 'interactive' | 'location' | 'image' | 'document' | 'audio' | 'video';
  text?: { body: string };
  location?: { latitude: number; longitude: number; name?: string; address?: string };
  interactive?: {
    type: 'button_reply' | 'list_reply';
    button_reply?: { id: string; title: string };
    list_reply?: { id: string; title: string; description?: string };
  };
  image?: { id: string };
  document?: { id: string };
  audio?: { id: string };
  video?: { id: string };
}

interface MetaDeliveryStatus {
  id: string; // the message id WE sent (matches WhatsAppLog.metaMsgId)
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  // Billing block — only present on a billable status (usually the first
  // `sent`/`delivered`). Meta does NOT include a numeric cost here, only the
  // billability flag + category, so we cannot derive costInr from this payload.
  pricing?: {
    billable?: boolean;
    pricing_model?: string;
    category?: string;
  };
}

/**
 * Main entry. Receives Meta's raw event body, dispatches each message to the
 * conversation engine, and updates delivery statuses in our WhatsAppLog.
 *
 * IMPORTANT: must complete fast (< 5s) or Meta will retry. Long work goes to
 * a queue (BullMQ) — see notes in engine.ts.
 */
export async function handleWebhook(
  event: MetaWebhookEvent,
): Promise<{ status: 200 }> {
  for (const entry of event.entry ?? []) {
    for (const change of entry.changes ?? []) {
      // Incoming messages
      for (const msg of change.value.messages ?? []) {
        const inbound = toInbound(msg);
        if (!inbound) continue;
        try {
          await engine.process(inbound);
        } catch (err: unknown) {
          // eslint-disable-next-line no-console
          console.error('[wa] engine error', err);
        }
      }
      // Delivery / read receipts (audit EDG-06 / ARC-10).
      // Persist the latest Meta status onto the WhatsAppLog row we created when
      // sending. We match on metaMsgId (the message id Meta echoes back as
      // status.id). Note: the status payload carries a `pricing` flag but no
      // numeric amount, so costInr cannot be derived here and is left untouched.
      for (const status of change.value.statuses ?? []) {
        if (!status.id) continue;
        try {
          await prisma.whatsAppLog.updateMany({
            where: { metaMsgId: status.id },
            data: { status: status.status },
          });
        } catch (err: unknown) {
          // eslint-disable-next-line no-console
          console.error('[wa] status update error', err);
        }
      }
    }
  }
  return { status: 200 };
}

function toInbound(m: MetaIncomingMessage): InboundMessage | null {
  const ts = Number(m.timestamp) * 1000;
  switch (m.type) {
    case 'text':
      if (!m.text) return null;
      return { kind: 'text', from: m.from, text: m.text.body, messageId: m.id, timestamp: ts };
    case 'interactive': {
      if (m.interactive?.type === 'button_reply' && m.interactive.button_reply) {
        return {
          kind: 'button',
          from: m.from,
          payload: m.interactive.button_reply.id,
          title: m.interactive.button_reply.title,
          messageId: m.id,
          timestamp: ts,
        };
      }
      if (m.interactive?.type === 'list_reply' && m.interactive.list_reply) {
        return {
          kind: 'list',
          from: m.from,
          rowId: m.interactive.list_reply.id,
          title: m.interactive.list_reply.title,
          messageId: m.id,
          timestamp: ts,
        };
      }
      return null;
    }
    case 'image':
      return m.image ? { kind: 'image', from: m.from, mediaId: m.image.id, messageId: m.id, timestamp: ts } : null;
    case 'document':
      return m.document ? { kind: 'document', from: m.from, mediaId: m.document.id, messageId: m.id, timestamp: ts } : null;
    case 'audio':
      return m.audio ? { kind: 'audio', from: m.from, mediaId: m.audio.id, messageId: m.id, timestamp: ts } : null;
    case 'video':
      return m.video ? { kind: 'video', from: m.from, mediaId: m.video.id, messageId: m.id, timestamp: ts } : null;
    case 'location':
      return m.location
        ? {
            kind: 'location',
            from: m.from,
            latitude: m.location.latitude,
            longitude: m.location.longitude,
            messageId: m.id,
            timestamp: ts,
          }
        : null;
  }
}
