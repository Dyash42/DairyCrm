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

  it('fails closed in production with no secret', () => {
    process.env.NODE_ENV = 'production';
    _resetConfigForTests();
    expect(new MetaMessagingProvider().verifyWebhookSignature('{}', undefined)).toBe(false);
  });

  it('passes in dev with no secret (so curl works)', () => {
    process.env.NODE_ENV = 'development';
    _resetConfigForTests();
    expect(new MetaMessagingProvider().verifyWebhookSignature('{}', undefined)).toBe(true);
  });
});
