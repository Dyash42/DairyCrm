import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';

import { registerWhatsAppRoutes } from './index';
import { _resetConfigForTests } from '../../config';
import { _resetMessagingProviderForTests } from '../../providers/messaging';

const APP_SECRET = 'test-app-secret-1234';
const VERIFY_TOKEN = 'test-verify-token';

function signBody(body: string, secret = APP_SECRET): string {
  return `sha256=${crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex')}`;
}

let app: FastifyInstance;

beforeAll(async () => {
  process.env.META_APP_SECRET = APP_SECRET;
  process.env.META_VERIFY_TOKEN = VERIFY_TOKEN;
  // Force Meta provider so signature verification is strict.
  process.env.META_PHONE_NUMBER_ID = 'test-pid';
  process.env.META_ACCESS_TOKEN = 'test-token';
  process.env.NODE_ENV = 'test';
  _resetConfigForTests();
  _resetMessagingProviderForTests();
  app = Fastify();
  await app.register(registerWhatsAppRoutes, { prefix: '/whatsapp' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  delete process.env.META_APP_SECRET;
  delete process.env.META_VERIFY_TOKEN;
  delete process.env.META_PHONE_NUMBER_ID;
  delete process.env.META_ACCESS_TOKEN;
  _resetMessagingProviderForTests();
});

describe('GET /whatsapp/webhook (Meta verification)', () => {
  it('returns 200 + challenge when token matches', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${VERIFY_TOKEN}&hub.challenge=meta-challenge-x`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('meta-challenge-x');
  });

  it('returns 403 when token mismatches', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=x`,
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /whatsapp/webhook (HMAC signature)', () => {
  const body = { object: 'whatsapp_business_account', entry: [] };
  const rawBody = JSON.stringify(body);

  it('returns 401 when signature header is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/whatsapp/webhook',
      payload: body,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 401 when signature is wrong', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/whatsapp/webhook',
      headers: { 'x-hub-signature-256': 'sha256=deadbeef'.padEnd(71, '0') },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 200 when signature matches', async () => {
    const sig = signBody(rawBody);
    const res = await app.inject({
      method: 'POST',
      url: '/whatsapp/webhook',
      headers: { 'x-hub-signature-256': sig },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
