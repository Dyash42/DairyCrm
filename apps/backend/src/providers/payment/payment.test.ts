import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { _resetConfigForTests } from '../../config';
import { _resetPaymentProviderForTests, getPaymentProvider } from './index';
import { RazorpayPaymentProvider } from './razorpay';
import { CashfreePaymentProvider } from './cashfree';
import { StubPaymentProvider } from './stub';

function clearAllEnv() {
  for (const k of [
    'PAYMENT_PROVIDER',
    'RAZORPAY_KEY_ID',
    'RAZORPAY_KEY_SECRET',
    'CASHFREE_APP_ID',
    'CASHFREE_SECRET_KEY',
  ]) {
    delete process.env[k];
  }
  _resetConfigForTests();
  _resetPaymentProviderForTests();
}

describe('payment provider factory', () => {
  beforeEach(() => clearAllEnv());
  afterEach(() => clearAllEnv());

  it('falls back to stub with no creds', () => {
    expect(getPaymentProvider()).toBeInstanceOf(StubPaymentProvider);
  });

  it('honors explicit PAYMENT_PROVIDER=razorpay', () => {
    process.env.PAYMENT_PROVIDER = 'razorpay';
    _resetConfigForTests();
    _resetPaymentProviderForTests();
    expect(getPaymentProvider()).toBeInstanceOf(RazorpayPaymentProvider);
  });

  it('honors explicit PAYMENT_PROVIDER=cashfree', () => {
    process.env.PAYMENT_PROVIDER = 'cashfree';
    _resetConfigForTests();
    _resetPaymentProviderForTests();
    expect(getPaymentProvider()).toBeInstanceOf(CashfreePaymentProvider);
  });

  it('auto-detects Razorpay when its keys are present', () => {
    process.env.RAZORPAY_KEY_ID = 'rk';
    process.env.RAZORPAY_KEY_SECRET = 'rs';
    _resetConfigForTests();
    _resetPaymentProviderForTests();
    expect(getPaymentProvider()).toBeInstanceOf(RazorpayPaymentProvider);
  });

  it('auto-detects Cashfree when Razorpay is absent but Cashfree present', () => {
    process.env.CASHFREE_APP_ID = 'cf-id';
    process.env.CASHFREE_SECRET_KEY = 'cf-secret';
    _resetConfigForTests();
    _resetPaymentProviderForTests();
    expect(getPaymentProvider()).toBeInstanceOf(CashfreePaymentProvider);
  });

  it('stub provider returns a deterministic-ish link', async () => {
    const stub = new StubPaymentProvider();
    const link = await stub.createPaymentLink({ customerId: 'c1', amount: 1920, note: 'test' });
    expect(link.url).toContain('stub.invalid/pay/');
    expect(link.amount).toBe(1920);
    expect(link.provider).toBe('stub');
  });
});

describe('isConfigured signals', () => {
  beforeEach(() => clearAllEnv());
  afterEach(() => clearAllEnv());

  it('razorpay reports unconfigured without keys', () => {
    expect(new RazorpayPaymentProvider().isConfigured).toBe(false);
  });

  it('razorpay reports configured with keys', () => {
    process.env.RAZORPAY_KEY_ID = 'rk';
    process.env.RAZORPAY_KEY_SECRET = 'rs';
    _resetConfigForTests();
    expect(new RazorpayPaymentProvider().isConfigured).toBe(true);
  });

  it('cashfree reports unconfigured without keys', () => {
    expect(new CashfreePaymentProvider().isConfigured).toBe(false);
  });
});
