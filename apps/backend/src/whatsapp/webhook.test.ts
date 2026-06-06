import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { verifyWebhook } from './webhook';

describe('verifyWebhook — Meta GET handshake', () => {
  const ORIGINAL_TOKEN = process.env.META_VERIFY_TOKEN;

  beforeEach(() => {
    process.env.META_VERIFY_TOKEN = 'test-verify-token-secret';
  });

  afterEach(() => {
    if (ORIGINAL_TOKEN === undefined) {
      delete process.env.META_VERIFY_TOKEN;
    } else {
      process.env.META_VERIFY_TOKEN = ORIGINAL_TOKEN;
    }
  });

  it('returns 200 + challenge when mode/token match', () => {
    const r = verifyWebhook({
      mode: 'subscribe',
      token: 'test-verify-token-secret',
      challenge: 'meta-random-challenge-123',
    });
    expect(r).toEqual({ status: 200, body: 'meta-random-challenge-123' });
  });

  it('returns 403 when token mismatches (attacker probing)', () => {
    const r = verifyWebhook({
      mode: 'subscribe',
      token: 'wrong-token',
      challenge: 'whatever',
    });
    expect(r.status).toBe(403);
  });

  it('returns 403 when mode is not subscribe', () => {
    const r = verifyWebhook({
      mode: 'unsubscribe',
      token: 'test-verify-token-secret',
      challenge: 'whatever',
    });
    expect(r.status).toBe(403);
  });

  it('returns 403 when META_VERIFY_TOKEN is unset (fail closed)', () => {
    delete process.env.META_VERIFY_TOKEN;
    const r = verifyWebhook({
      mode: 'subscribe',
      token: 'anything',
      challenge: 'whatever',
    });
    expect(r.status).toBe(403);
  });

  it('returns 403 when any param is missing', () => {
    expect(verifyWebhook({ mode: undefined, token: 'x', challenge: 'y' }).status).toBe(403);
    expect(verifyWebhook({ mode: 'subscribe', token: undefined, challenge: 'y' }).status).toBe(403);
    expect(verifyWebhook({ mode: 'subscribe', token: 'test-verify-token-secret', challenge: undefined }).status).toBe(403);
  });
});
