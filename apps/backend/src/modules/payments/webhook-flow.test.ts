/**
 * Integration test — payment webhook → balance increment flow.
 *
 * Mocks prisma in-memory so we can verify the full path end-to-end:
 *   1. Receive a signed Razorpay webhook
 *   2. Verify signature
 *   3. Look up the matching Payment row by `reference`
 *   4. Mark it PAID and increment Customer.balance, both in one transaction
 *   5. Idempotent: re-firing the same webhook is a no-op
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';

// --- Mock the prisma module so we don't need a real DB ---
type PaymentRow = {
  id: string;
  customerId: string;
  amount: number;
  status: 'PENDING' | 'PAID' | 'FAILED';
  reference: string | null;
  paidAt: Date | null;
};
type CustomerRow = { id: string; balance: number };

const payments = new Map<string, PaymentRow>();
const customers = new Map<string, CustomerRow>();

vi.mock('../../prisma', () => {
  return {
    prisma: {
      payment: {
        async findFirst({ where }: { where: { reference: string } }) {
          for (const p of payments.values()) {
            if (p.reference === where.reference) return p;
          }
          return null;
        },
        async update({ where, data }: { where: { id: string }; data: Partial<PaymentRow> }) {
          const row = payments.get(where.id);
          if (!row) return null;
          const next = { ...row, ...data };
          payments.set(where.id, next);
          return next;
        },
      },
      customer: {
        async update({ where, data }: { where: { id: string }; data: { balance?: { increment: number } } }) {
          const c = customers.get(where.id);
          if (!c) return null;
          if (data.balance?.increment !== undefined) {
            c.balance += data.balance.increment;
          }
          customers.set(where.id, c);
          return c;
        },
      },
      // $transaction just calls the callback with the prisma surface
      async $transaction<T>(cb: (tx: unknown) => Promise<T>) {
        // re-import the mocked prisma object — we need a stable reference
        // Use the same object we exported via the closure.
        return cb({
          payment: {
            update: async ({ where, data }: any) => {
              const row = payments.get(where.id);
              if (!row) return null;
              const next = { ...row, ...data };
              payments.set(where.id, next);
              return next;
            },
          },
          customer: {
            update: async ({ where, data }: any) => {
              const c = customers.get(where.id);
              if (!c) return null;
              if (data.balance?.increment !== undefined) {
                c.balance += data.balance.increment;
              }
              customers.set(where.id, c);
              return c;
            },
          },
        });
      },
    },
  };
});

import { registerPaymentRoutes } from './index';
import { _resetConfigForTests } from '../../config';
import { _resetPaymentProviderForTests } from '../../providers/payment';

const RAZORPAY_WEBHOOK_SECRET = 'test-razorpay-webhook-secret';

let app: FastifyInstance;

function razorpaySign(body: string, secret = RAZORPAY_WEBHOOK_SECRET): string {
  return crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

function fakeJwtAuth(): (req: any, _reply: any) => Promise<void> {
  // Stub the authenticate decorator so admin routes don't 401 in this
  // test; the webhook route bypasses auth anyway.
  return async () => {};
}

beforeAll(async () => {
  process.env.PAYMENT_PROVIDER = 'razorpay';
  process.env.RAZORPAY_KEY_ID = 'rk_test';
  process.env.RAZORPAY_KEY_SECRET = 'rs_test';
  process.env.RAZORPAY_WEBHOOK_SECRET = RAZORPAY_WEBHOOK_SECRET;
  _resetConfigForTests();
  _resetPaymentProviderForTests();

  app = Fastify();
  app.decorate('authenticate', fakeJwtAuth());
  await app.register(registerPaymentRoutes, { prefix: '/payments' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  delete process.env.PAYMENT_PROVIDER;
  delete process.env.RAZORPAY_KEY_ID;
  delete process.env.RAZORPAY_KEY_SECRET;
  delete process.env.RAZORPAY_WEBHOOK_SECRET;
  _resetConfigForTests();
  _resetPaymentProviderForTests();
});

beforeEach(() => {
  payments.clear();
  customers.clear();
});

describe('POST /payments/webhook — Razorpay flow', () => {
  it('marks payment PAID and credits the customer when the signature is valid', async () => {
    customers.set('cust1', { id: 'cust1', balance: 0 });
    payments.set('pay1', {
      id: 'pay1',
      customerId: 'cust1',
      amount: 0,
      status: 'PENDING',
      reference: 'plink_xyz',
      paidAt: null,
    });

    const event = {
      event: 'payment_link.paid',
      payload: {
        payment_link: {
          entity: {
            id: 'plink_xyz',
            reference_id: 'plink_xyz',
            amount: 19200, // 192.00 INR in paise
          },
        },
      },
    };
    const body = JSON.stringify(event);

    const res = await app.inject({
      method: 'POST',
      url: '/payments/webhook',
      headers: { 'x-razorpay-signature': razorpaySign(body), 'content-type': 'application/json' },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    expect(payments.get('pay1')?.status).toBe('PAID');
    expect(payments.get('pay1')?.amount).toBe(192);
    expect(customers.get('cust1')?.balance).toBe(192);
  });

  it('rejects a webhook with an invalid signature', async () => {
    const body = JSON.stringify({ event: 'payment_link.paid', payload: {} });
    const res = await app.inject({
      method: 'POST',
      url: '/payments/webhook',
      headers: { 'x-razorpay-signature': 'deadbeef', 'content-type': 'application/json' },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
  });

  it('is idempotent — a second fire of the same webhook does not double-credit', async () => {
    customers.set('cust1', { id: 'cust1', balance: 0 });
    payments.set('pay1', {
      id: 'pay1',
      customerId: 'cust1',
      amount: 0,
      status: 'PENDING',
      reference: 'plink_abc',
      paidAt: null,
    });

    const event = {
      payload: {
        payment_link: { entity: { id: 'plink_abc', amount: 5000 } },
      },
    };
    const body = JSON.stringify(event);
    const headers = { 'x-razorpay-signature': razorpaySign(body), 'content-type': 'application/json' };

    const r1 = await app.inject({ method: 'POST', url: '/payments/webhook', headers, payload: body });
    expect(r1.statusCode).toBe(200);
    expect(customers.get('cust1')?.balance).toBe(50);

    const r2 = await app.inject({ method: 'POST', url: '/payments/webhook', headers, payload: body });
    expect(r2.statusCode).toBe(200);
    // Balance unchanged — second call detected it was already PAID
    expect(customers.get('cust1')?.balance).toBe(50);
  });

  it('200-acks an unknown reference without erroring (Meta-style retries would hammer us)', async () => {
    const event = {
      payload: { payment_link: { entity: { id: 'plink_unknown', amount: 100 } } },
    };
    const body = JSON.stringify(event);
    const res = await app.inject({
      method: 'POST',
      url: '/payments/webhook',
      headers: { 'x-razorpay-signature': razorpaySign(body), 'content-type': 'application/json' },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true });
  });
});
