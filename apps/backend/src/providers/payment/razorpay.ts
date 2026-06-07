/**
 * Razorpay implementation of PaymentProvider.
 *
 * API docs: https://razorpay.com/docs/api/payments/payment-links/
 * Webhook signing: HMAC-SHA256 of raw body using webhook secret.
 */

import crypto from 'node:crypto';

import { loadConfig } from '../../config';
import type { PaymentLink, PaymentLinkInput, PaymentProvider } from './types';

interface RazorpayLinkResponse {
  id: string;
  short_url?: string;
  amount?: number;
  status?: string;
}

export class RazorpayPaymentProvider implements PaymentProvider {
  readonly name = 'razorpay' as const;

  get isConfigured(): boolean {
    const c = loadConfig();
    return Boolean(c.RAZORPAY_KEY_ID && c.RAZORPAY_KEY_SECRET);
  }

  async createPaymentLink(input: PaymentLinkInput): Promise<PaymentLink> {
    const c = loadConfig();
    if (!c.RAZORPAY_KEY_ID || !c.RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay not configured');
    }
    const res = await fetch('https://api.razorpay.com/v1/payment_links', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Basic ${Buffer.from(`${c.RAZORPAY_KEY_ID}:${c.RAZORPAY_KEY_SECRET}`).toString('base64')}`,
      },
      body: JSON.stringify({
        amount: input.amount * 100,
        currency: 'INR',
        accept_partial: false,
        description: input.note,
        reference_id: input.referenceId,
        customer: input.customer
          ? {
              name: input.customer.name,
              contact: input.customer.phone,
              email: input.customer.email,
            }
          : undefined,
        notify: { sms: false, email: false },
        reminder_enable: false,
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Razorpay ${res.status}: ${text.slice(0, 200)}`);
    }
    const data = (await res.json()) as RazorpayLinkResponse;
    return {
      id: data.id,
      url: data.short_url ?? `https://rzp.io/l/${data.id}`,
      amount: input.amount,
      provider: this.name,
    };
  }

  verifyWebhookSignature(rawBody: string, signature: string): boolean {
    const c = loadConfig();
    if (!c.RAZORPAY_WEBHOOK_SECRET) return false;
    const expected = crypto
      .createHmac('sha256', c.RAZORPAY_WEBHOOK_SECRET)
      .update(rawBody, 'utf8')
      .digest('hex');
    if (expected.length !== signature.length) return false;
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  }
}
