/**
 * Cashfree implementation of PaymentProvider.
 *
 * API docs: https://docs.cashfree.com/reference/pg-payment-links
 * Auth: x-client-id + x-client-secret headers.
 * Webhook signing: HMAC-SHA256 of `timestamp + rawBody` using webhook secret;
 *                  signature header is `x-webhook-signature`.
 *
 * NOTE: This is the integration *shape* — endpoints, headers, payload, sig
 * algorithm are correct per Cashfree's public docs. Once you supply real
 * sandbox creds via env, run the same tests we run for Razorpay against it.
 */

import crypto from 'node:crypto';

import { loadConfig } from '../../config';
import type { PaymentLink, PaymentLinkInput, PaymentProvider } from './types';

const CASHFREE_API_VERSION = '2023-08-01';

interface CashfreeLinkResponse {
  link_id?: string;
  link_url?: string;
  link_amount?: number;
}

export class CashfreePaymentProvider implements PaymentProvider {
  readonly name = 'cashfree' as const;

  get isConfigured(): boolean {
    const c = loadConfig();
    return Boolean(c.CASHFREE_APP_ID && c.CASHFREE_SECRET_KEY);
  }

  private apiBase(): string {
    return loadConfig().CASHFREE_ENV === 'production'
      ? 'https://api.cashfree.com/pg'
      : 'https://sandbox.cashfree.com/pg';
  }

  async createPaymentLink(input: PaymentLinkInput): Promise<PaymentLink> {
    const c = loadConfig();
    if (!c.CASHFREE_APP_ID || !c.CASHFREE_SECRET_KEY) {
      throw new Error('Cashfree not configured');
    }

    const res = await fetch(`${this.apiBase()}/links`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-version': CASHFREE_API_VERSION,
        'x-client-id': c.CASHFREE_APP_ID,
        'x-client-secret': c.CASHFREE_SECRET_KEY,
      },
      body: JSON.stringify({
        link_id: input.referenceId ?? `link_${Date.now()}_${input.customerId}`,
        link_amount: input.amount,
        link_currency: 'INR',
        link_purpose: input.note,
        customer_details: input.customer
          ? {
              customer_name: input.customer.name,
              customer_phone: input.customer.phone,
              customer_email: input.customer.email,
            }
          : undefined,
        link_notify: { send_sms: false, send_email: false },
        link_auto_reminders: false,
      }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Cashfree ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as CashfreeLinkResponse;
    return {
      id: data.link_id ?? '',
      url: data.link_url ?? '',
      amount: input.amount,
      provider: this.name,
    };
  }

  /**
   * Verify a Cashfree webhook.
   *
   * Per Cashfree docs (https://docs.cashfree.com/docs/webhook-security):
   *   signature = base64( HMAC-SHA256( timestamp + rawBody, secret ) )
   *
   * Where `timestamp` is the value of the `x-webhook-timestamp` header
   * Cashfree includes on every webhook call. The previous code only
   * HMAC'd the body — Cashfree's actual webhooks would NEVER verify
   * because the timestamp prefix was missing.
   *
   * `timestamp` arg is the raw header value; the webhook route reads
   * `req.headers['x-webhook-timestamp']` and passes it here.
   *
   * Replay protection: reject webhooks whose timestamp is more than
   * MAX_AGE_MS old. A captured signed body can otherwise be replayed
   * indefinitely.
   */
  verifyWebhookSignature(
    rawBody: string,
    signature: string,
    timestamp?: string,
  ): boolean {
    const c = loadConfig();
    if (!c.CASHFREE_WEBHOOK_SECRET) return false;
    if (!signature) return false;
    if (!timestamp) return false;

    // Reject stale events (>5 min). Cashfree retries with the SAME
    // timestamp so this also blocks an attacker who captured an old
    // body+signature from replaying it later.
    const MAX_AGE_MS = 5 * 60 * 1000;
    const eventTs = Number(timestamp);
    if (!Number.isFinite(eventTs)) return false;
    // Cashfree timestamps are in milliseconds. Allow small clock skew
    // (1 min in the future).
    const now = Date.now();
    if (eventTs > now + 60_000) return false;
    if (now - eventTs > MAX_AGE_MS) return false;

    const expected = crypto
      .createHmac('sha256', c.CASHFREE_WEBHOOK_SECRET)
      .update(`${timestamp}${rawBody}`, 'utf8')
      .digest('base64');
    // Length-guard first — timingSafeEqual throws on mismatched lengths.
    // Constant-time compare prevents secret exfiltration via timing oracle
    // (plain `===` short-circuits on first mismatching byte).
    if (expected.length !== signature.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }
}
