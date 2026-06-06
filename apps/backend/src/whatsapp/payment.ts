/**
 * Razorpay payment-link generator.
 *
 * Behavior depends on env:
 *   - RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET set → real call to Razorpay
 *   - either missing → stub (returns rzp.io/l/stub-* URL, logs a warning)
 *
 * This is intentional: dev/CI works without creds; production fails fast if
 * the keys aren't set and a real link is requested.
 *
 * Razorpay Payment Links API:
 * POST https://api.razorpay.com/v1/payment_links
 * Auth: Basic <base64(key:secret)>
 */

import { loadConfig } from '../config';

export interface PaymentLinkInput {
  customerId: string;
  amount: number; // INR (whole rupees)
  note: string;
  customer?: { name?: string; contact?: string; email?: string };
}

export interface PaymentLink {
  id: string;
  url: string;
  amount: number;
}

interface RazorpayResponse {
  id: string;
  short_url?: string;
  amount?: number;
}

export async function createRazorpayPaymentLink(
  input: PaymentLinkInput,
): Promise<PaymentLink> {
  const config = loadConfig();
  const keyId = config.RAZORPAY_KEY_ID;
  const secret = config.RAZORPAY_KEY_SECRET;

  if (!keyId || !secret) {
    const id = `plink_stub_${Date.now()}`;
    // eslint-disable-next-line no-console
    console.warn(`[razorpay] stub mode (no creds) — returning ${id}`);
    return { id, url: `https://rzp.io/l/${id}`, amount: input.amount };
  }

  const body = {
    amount: input.amount * 100, // paise
    currency: 'INR',
    accept_partial: false,
    description: input.note,
    customer: input.customer ?? undefined,
    notify: { sms: false, email: false },
    reminder_enable: false,
  };

  const res = await fetch('https://api.razorpay.com/v1/payment_links', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Basic ${Buffer.from(`${keyId}:${secret}`).toString('base64')}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Razorpay error ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as RazorpayResponse;
  return {
    id: data.id,
    url: data.short_url ?? `https://rzp.io/l/${data.id}`,
    amount: input.amount,
  };
}
