/**
 * Integration test — POST /customers/bulk/validate cross-DB checks.
 *
 * Exercises the route handler's cross-checks against an in-memory Prisma
 * mock:
 *   - phone already in DB → flagged as error
 *   - route name doesn't exist → flagged
 *   - product code doesn't exist → flagged
 *   - customer_code already taken → flagged
 *   - happy path: all preconditions met → row returns in `valid`
 *
 * The pure parser is already covered by bulk-customer-import.test.ts.
 * This file tests the wiring between parser and DB-aware validator.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

const dbCustomers: Array<{ phone: string; code: string }> = [];
const dbRoutes: Array<{ id: string; name: string }> = [];
const dbProducts: Array<{ id: string; code: string; ratePerUnit: number }> = [];

let createdCustomerCount = 0;

vi.mock('../../prisma', () => {
  // prismaMock IS the tx in $transaction (Prisma's transactional client has
  // the same shape), so the /commit create path resolves against it.
  const prismaMock: any = {
    customer: {
      async findMany({ where, select }: any) {
        const out: any[] = [];
        for (const c of dbCustomers) {
          if (where.phone?.in && where.phone.in.includes(c.phone)) {
            out.push(select?.phone ? { phone: c.phone } : c);
          } else if (where.code?.in && where.code.in.includes(c.code)) {
            out.push(select?.code ? { code: c.code } : c);
          }
        }
        return out;
      },
      async create({ data }: any) {
        createdCustomerCount += 1;
        return { id: `cust-${createdCustomerCount}`, ...data };
      },
    },
    route: {
      async findMany({ where, select }: any) {
        return dbRoutes
          .filter((r) => where.name.in.includes(r.name))
          .map((r) => (select ? { id: r.id, name: r.name } : r));
      },
    },
    product: {
      async findMany({ where, select }: any) {
        return dbProducts
          .filter((p) => where.code.in.includes(p.code))
          .map((p) =>
            select
              ? { id: p.id, code: p.code, ratePerUnit: p.ratePerUnit }
              : p,
          );
      },
    },
    qrCode: { async create() { return {}; } },
    subscription: { async create({ data }: any) { return { id: 'sub-1', ...data }; } },
    renewalReminder: { async create() { return {}; } },
    async $transaction(fn: any) { return fn(prismaMock); },
  };
  return { prisma: prismaMock };
});

// Deterministic code allocator so /commit doesn't query a real counter.
vi.mock('../../services/customer-code', () => ({
  nextCustomerCode: async () => 'JHR-100999',
}));

// Stub out settings to avoid touching SettingsService
vi.mock('../../services/settings', () => ({
  settings: {
    async getNumber(_key: string, def: number) {
      return def;
    },
  },
}));

import { registerCustomerBulkRoutes } from './bulk';

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  app.decorate('authenticate', async () => {});
  await app.register(registerCustomerBulkRoutes, { prefix: '/customers/bulk' });
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

beforeEach(() => {
  dbCustomers.length = 0;
  dbRoutes.length = 0;
  dbProducts.length = 0;
  createdCustomerCount = 0;
});

const VALID_CSV_HEADER =
  'name,phone,alt_phone,email,address_line1,area,pin_code,route_name,product_code,litres_per_day,days_of_week,duration_days,start_date,customer_code';

describe('POST /customers/bulk/validate', () => {
  it('rejects when csv body is missing (4xx/5xx, not 200)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/customers/bulk/validate',
      headers: { 'content-type': 'application/json' },
      payload: {},
    });
    // In the real server the global error handler maps ZodError → 422.
    // In this lightweight test app without that handler, it bubbles to 500.
    // Either way, NOT 200 — that's what matters.
    expect(res.statusCode).not.toBe(200);
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
  });

  it('flags a row whose phone is already in the DB', async () => {
    dbCustomers.push({ phone: '+919876543210', code: 'JHR-100001' });
    dbRoutes.push({ id: 'r1', name: 'Route 4' });
    dbProducts.push({ id: 'p1', code: 'COW_MILK', ratePerUnit: 60 });

    const csv = [
      VALID_CSV_HEADER,
      'Anita,9876543210,,,Plot 4,Berhampur,760004,Route 4,COW_MILK,1.5,EVERY_DAY,30,,',
    ].join('\n');

    const res = await app.inject({
      method: 'POST',
      url: '/customers/bulk/validate',
      headers: { 'content-type': 'application/json' },
      payload: { csv },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toHaveLength(0);
    expect(body.issues.some((i: any) => /already exists/.test(i.message))).toBe(true);
  });

  it('flags an unknown route name', async () => {
    dbRoutes.push({ id: 'r1', name: 'Route 4' });
    dbProducts.push({ id: 'p1', code: 'COW_MILK', ratePerUnit: 60 });

    const csv = [
      VALID_CSV_HEADER,
      'Anita,9876543210,,,Plot 4,Berhampur,760004,Route ZZZ,COW_MILK,1.5,EVERY_DAY,30,,',
    ].join('\n');

    const res = await app.inject({
      method: 'POST',
      url: '/customers/bulk/validate',
      headers: { 'content-type': 'application/json' },
      payload: { csv },
    });
    const body = res.json();
    expect(body.valid).toHaveLength(0);
    expect(body.issues.some((i: any) => i.column === 'route_name')).toBe(true);
  });

  it('flags an unknown product code', async () => {
    dbRoutes.push({ id: 'r1', name: 'Route 4' });
    // No product seeded

    const csv = [
      VALID_CSV_HEADER,
      'Anita,9876543210,,,Plot 4,Berhampur,760004,Route 4,EXOTIC_KEFIR,1.5,EVERY_DAY,30,,',
    ].join('\n');

    const res = await app.inject({
      method: 'POST',
      url: '/customers/bulk/validate',
      headers: { 'content-type': 'application/json' },
      payload: { csv },
    });
    const body = res.json();
    expect(body.valid).toHaveLength(0);
    expect(body.issues.some((i: any) => i.column === 'product_code')).toBe(true);
  });

  it('flags duplicate customer_code already in DB', async () => {
    dbCustomers.push({ phone: '+910000000000', code: 'JHR-100390' });
    dbRoutes.push({ id: 'r1', name: 'Route 4' });
    dbProducts.push({ id: 'p1', code: 'COW_MILK', ratePerUnit: 60 });

    const csv = [
      VALID_CSV_HEADER,
      'Anita,9876543210,,,Plot 4,Berhampur,760004,Route 4,COW_MILK,1.5,EVERY_DAY,30,,JHR-100390',
    ].join('\n');

    const res = await app.inject({
      method: 'POST',
      url: '/customers/bulk/validate',
      headers: { 'content-type': 'application/json' },
      payload: { csv },
    });
    const body = res.json();
    expect(body.valid).toHaveLength(0);
    expect(body.issues.some((i: any) => i.column === 'customer_code')).toBe(true);
  });

  it('passes through a valid row when route + product are present', async () => {
    dbRoutes.push({ id: 'r1', name: 'Route 4' });
    dbProducts.push({ id: 'p1', code: 'COW_MILK', ratePerUnit: 60 });

    const csv = [
      VALID_CSV_HEADER,
      'Anita,9876543210,,,Plot 4,Berhampur,760004,Route 4,COW_MILK,1.5,EVERY_DAY,30,,',
    ].join('\n');

    const res = await app.inject({
      method: 'POST',
      url: '/customers/bulk/validate',
      headers: { 'content-type': 'application/json' },
      payload: { csv },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.valid).toHaveLength(1);
    expect(body.summary.errorCount).toBe(0);
    expect(body.valid[0].phone).toBe('+919876543210');
    expect(body.valid[0].routeName).toBe('Route 4');
    expect(body.valid[0].productCode).toBe('COW_MILK');
  });
});

describe('POST /customers/bulk/commit (SEC-03/ADM-04 server-side re-validation)', () => {
  const validRow = {
    row: 2,
    name: 'Anita',
    phone: '+919876543210',
    addressLine1: 'Plot 4',
    area: 'Berhampur',
    pinCode: '760004',
    routeName: 'Route 4',
    productCode: 'COW_MILK',
    litresPerDay: 1.5,
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    durationDays: 30,
    startDate: '2026-06-01',
  };

  it('rejects malformed / out-of-range rows instead of trusting the client', async () => {
    // A crafted POST that bypasses the browser preview: bad phone, litres > 50,
    // negative duration. NONE may be written; all land in `failures`.
    const res = await app.inject({
      method: 'POST',
      url: '/customers/bulk/commit',
      headers: { 'content-type': 'application/json' },
      payload: {
        rows: [
          { ...validRow, row: 2, phone: 'not-a-phone' },
          { ...validRow, row: 3, litresPerDay: 999 },
          { ...validRow, row: 4, durationDays: -5 },
        ],
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.imported).toBe(0);
    expect(body.failures).toHaveLength(3);
  });

  it('imports a valid row (schema is not over-strict)', async () => {
    dbRoutes.push({ id: 'r1', name: 'Route 4' });
    dbProducts.push({ id: 'p1', code: 'COW_MILK', ratePerUnit: 60 });
    const res = await app.inject({
      method: 'POST',
      url: '/customers/bulk/commit',
      headers: { 'content-type': 'application/json' },
      payload: { rows: [validRow] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.imported).toBe(1);
    expect(body.failures).toHaveLength(0);
  });

  it('rejects a row whose phone already exists in the DB', async () => {
    dbCustomers.push({ phone: '+919876543210', code: 'JHR-100001' });
    dbRoutes.push({ id: 'r1', name: 'Route 4' });
    dbProducts.push({ id: 'p1', code: 'COW_MILK', ratePerUnit: 60 });
    const res = await app.inject({
      method: 'POST',
      url: '/customers/bulk/commit',
      headers: { 'content-type': 'application/json' },
      payload: { rows: [validRow] },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.imported).toBe(0);
    expect(body.failures.some((f: any) => /already exists/.test(f.error))).toBe(true);
  });
});
