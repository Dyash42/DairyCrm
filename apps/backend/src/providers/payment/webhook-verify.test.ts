/**
 * Provider-side webhook signature verification.
 *
 * These tests exercise the two real provider implementations
 * (Razorpay HMAC-SHA256 hex; Cashfree HMAC-SHA256 base64) with the actual
 * crypto code that ships in production. No DB, no HTTP, no Fastify.
 *
 * The HTTP-layer test (modules/payments/webhook.test.ts) verifies that the
 * `/payments/webhook` endpoint rejects unsigned requests and is idempotent.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

import { _resetConfigForTests } from '../../config';
import { RazorpayPaymentProvider } from './razorpay';
import { CashfreePaymentProvider } from './cashfree';
import { StubPaymentProvider } from './stub';

const RAZORPAY_SECRET = 'razorpay-test-webhook-secret';
const CASHFREE_SECRET = 'cashfree-test-webhook-secret';

function setRazorpayCreds() {
  process.env.RAZORPAY_KEY_ID = 'rk_test';
  process.env.RAZORPAY_KEY_SECRET = 'rs_test';
  process.env.RAZORPAY_WEBHOOK_SECRET = RAZORPAY_SECRET;
  _resetConfigForTests();
}

function setCashfreeCreds() {
  process.env.CASHFREE_APP_ID = 'cf-id';
  process.env.CASHFREE_SECRET_KEY = 'cf-secret';
  process.env.CASHFREE_WEBHOOK_SECRET = CASHFREE_SECRET;
  _resetConfigForTests();
}

function clearAll() {
  for (const k of [
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'RAZORPAY_WEBHOOK_SECRET',
    'CASHFREE_APP_ID',
    'CASHFREE_SECRET_KEY',
    'CASHFREE_WEBHOOK_SECRET',
  ]) {
    delete process.env[k];
  }
  _resetConfigForTests();
}

function razorpaySign(body: string, secret = RAZORPAY_SECRET): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

function cashfreeSign(
  body: string,
  timestamp: string,
  secret = CASHFREE_SECRET,
): string {
  // Cashfree HMACs over `timestamp + body`, not body alone.
  return crypto.createHmac('sha256', secret).update(`${timestamp}${body}`, 'utf8').digest('base64');
}

/** A recent timestamp the verifier will accept (within the 5-min replay window). */
function freshTs(): string {
  return String(Date.now());
}

describe('RazorpayPaymentProvider.verifyWebhookSignature', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('accepts a valid HMAC-SHA256 hex signature', () => {
    setRazorpayCreds();
    const body = JSON.stringify({ event: 'payment_link.paid', payload: {} });
    const sig = razorpaySign(body);
    expect(new RazorpayPaymentProvider().verifyWebhookSignature(body, sig)).toBe(true);
  });

  it('rejects a forged signature', () => {
    setRazorpayCreds();
    const body = JSON.stringify({ event: 'payment_link.paid' });
    const sig = razorpaySign(body, 'attacker-secret');
    expect(new RazorpayPaymentProvider().verifyWebhookSignature(body, sig)).toBe(false);
  });

  it('rejects if the body was tampered with', () => {
    setRazorpayCreds();
    const original = JSON.stringify({ event: 'payment_link.paid', amount: 100 });
    const sig = razorpaySign(original);
    const tampered = JSON.stringify({ event: 'payment_link.paid', amount: 99999 });
    expect(new RazorpayPaymentProvider().verifyWebhookSignature(tampered, sig)).toBe(false);
  });

  it('rejects when no webhook secret is configured', () => {
    // Set Razorpay creds but NO webhook secret
    process.env.RAZORPAY_KEY_ID = 'rk_test';
    process.env.RAZORPAY_KEY_SECRET = 'rs_test';
    _resetConfigForTests();
    const body = '{}';
    // Any signature should fail
    expect(new RazorpayPaymentProvider().verifyWebhookSignature(body, 'whatever')).toBe(false);
  });

  it('rejects a signature of the wrong length safely (no throw)', () => {
    setRazorpayCreds();
    const body = '{}';
    // timingSafeEqual would throw on mismatched lengths — the provider must guard
    expect(() =>
      new RazorpayPaymentProvider().verifyWebhookSignature(body, 'short'),
    ).not.toThrow();
    expect(new RazorpayPaymentProvider().verifyWebhookSignature(body, 'short')).toBe(false);
  });

  it('rejects an empty signature', () => {
    setRazorpayCreds();
    expect(new RazorpayPaymentProvider().verifyWebhookSignature('{}', '')).toBe(false);
  });
});

describe('CashfreePaymentProvider.verifyWebhookSignature', () => {
  beforeEach(clearAll);
  afterEach(clearAll);

  it('accepts a valid HMAC-SHA256 base64 signature with fresh timestamp', () => {
    setCashfreeCreds();
    const ts = freshTs();
    const body = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK', data: {} });
    const sig = cashfreeSign(body, ts);
    expect(new CashfreePaymentProvider().verifyWebhookSignature(body, sig, ts)).toBe(true);
  });

  it('rejects a forged signature', () => {
    setCashfreeCreds();
    const ts = freshTs();
    const body = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK' });
    const sig = cashfreeSign(body, ts, 'attacker-secret');
    expect(new CashfreePaymentProvider().verifyWebhookSignature(body, sig, ts)).toBe(false);
  });

  it('rejects when no webhook secret is configured', () => {
    process.env.CASHFREE_APP_ID = 'cf-id';
    process.env.CASHFREE_SECRET_KEY = 'cf-secret';
    _resetConfigForTests();
    const ts = freshTs();
    expect(
      new CashfreePaymentProvider().verifyWebhookSignature('{}', cashfreeSign('{}', ts), ts),
    ).toBe(false);
  });

  it('rejects replays: a timestamp older than 5 minutes is refused even with a valid signature', () => {
    setCashfreeCreds();
    const staleTs = String(Date.now() - 6 * 60 * 1000);
    const body = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK' });
    const sig = cashfreeSign(body, staleTs);
    expect(new CashfreePaymentProvider().verifyWebhookSignature(body, sig, staleTs)).toBe(false);
  });

  it('rejects when the timestamp header is missing entirely', () => {
    setCashfreeCreds();
    const ts = freshTs();
    const body = JSON.stringify({ type: 'PAYMENT_SUCCESS_WEBHOOK' });
    const sig = cashfreeSign(body, ts);
    expect(new CashfreePaymentProvider().verifyWebhookSignature(body, sig, undefined)).toBe(false);
  });
});

describe('StubPaymentProvider.verifyWebhookSignature', () => {
  it('always rejects — never accept stub webhooks in any environment', () => {
    expect(new StubPaymentProvider().verifyWebhookSignature()).toBe(false);
  });
});
