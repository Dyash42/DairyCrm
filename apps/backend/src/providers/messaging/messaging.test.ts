import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { _resetConfigForTests } from '../../config';
import { _resetMessagingProviderForTests, getMessagingProvider } from './index';
import { MetaMessagingProvider } from './meta';
import { StubMessagingProvider } from './stub';

function clearAllEnv() {
  for (const k of [
    'MESSAGING_PROVIDER',
    'META_PHONE_NUMBER_ID',
    'META_ACCESS_TOKEN',
    'META_APP_SECRET',
    'NODE_ENV',
    'ALLOW_UNSIGNED_WEBHOOK',
    'DATABASE_URL',
    'JWT_SECRET',
    'ADMIN_ORIGIN',
  ]) {
    delete process.env[k];
  }
  _resetConfigForTests();
  _resetMessagingProviderForTests();
}

describe('messaging provider factory', () => {
  beforeEach(() => clearAllEnv());
  afterEach(() => clearAllEnv());

  it('falls back to stub when no creds', () => {
    expect(getMessagingProvider()).toBeInstanceOf(StubMessagingProvider);
  });

  it('uses Meta when creds present', () => {
    process.env.META_PHONE_NUMBER_ID = 'pid';
    process.env.META_ACCESS_TOKEN = 'tkn';
    _resetConfigForTests();
    _resetMessagingProviderForTests();
    expect(getMessagingProvider()).toBeInstanceOf(MetaMessagingProvider);
  });

  it('honors explicit MESSAGING_PROVIDER=stub', () => {
    process.env.MESSAGING_PROVIDER = 'stub';
    _resetConfigForTests();
    _resetMessagingProviderForTests();
    expect(getMessagingProvider()).toBeInstanceOf(StubMessagingProvider);
  });
});

describe('Meta webhook signature verification', () => {
  beforeEach(() => clearAllEnv());
  afterEach(() => clearAllEnv());

  it('fails closed in dev/staging with no secret and no ALLOW_UNSIGNED_WEBHOOK', () => {
    // Default (ALLOW_UNSIGNED_WEBHOOK unset → '0'): even in dev we reject
    // unsigned webhooks. Staging is internet-exposed; the previous
    // NODE_ENV-only gate let anyone inject events.
    process.env.NODE_ENV = 'development';
    _resetConfigForTests();
    expect(new MetaMessagingProvider().verifyWebhookSignature('{}', undefined)).toBe(false);
  });

  it('accepts unsigned webhooks in dev ONLY when ALLOW_UNSIGNED_WEBHOOK=1', () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_UNSIGNED_WEBHOOK = '1';
    _resetConfigForTests();
    expect(new MetaMessagingProvider().verifyWebhookSignature('{}', undefined)).toBe(true);
    delete process.env.ALLOW_UNSIGNED_WEBHOOK;
  });

  it('refuses unsigned webhooks in production even with ALLOW_UNSIGNED_WEBHOOK=1', () => {
    // Production guardrail: the flag is dev-only. We have to satisfy the
    // boot guards (DATABASE_URL + non-default JWT_SECRET + non-default
    // ADMIN_ORIGIN) just to load config without exiting.
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://test';
    process.env.JWT_SECRET = 'a-real-non-default-jwt-secret-here';
    process.env.ADMIN_ORIGIN = 'https://admin.example.com';
    process.env.ALLOW_UNSIGNED_WEBHOOK = '1';
    _resetConfigForTests();
    expect(new MetaMessagingProvider().verifyWebhookSignature('{}', undefined)).toBe(false);
    delete process.env.DATABASE_URL;
    delete process.env.JWT_SECRET;
    delete process.env.ADMIN_ORIGIN;
    delete process.env.ALLOW_UNSIGNED_WEBHOOK;
  });
});
