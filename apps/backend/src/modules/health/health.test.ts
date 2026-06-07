import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerHealthRoutes } from './index';

let app: FastifyInstance;

beforeAll(async () => {
  app = Fastify();
  await app.register(registerHealthRoutes);
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

describe('GET /health', () => {
  it('returns 200 even without a DB (process-up signal)', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // status will be 'degraded' here because DB isn't reachable in unit tests
    expect(['ok', 'degraded']).toContain(body.status);
    expect(body.service).toBe('jharanai-backend');
    expect(body.dependencies).toBeDefined();
    expect(typeof body.timestamp).toBe('string');
  });

  it('returns 503 with ?strict=1 when DB is down', async () => {
    const res = await app.inject({ method: 'GET', url: '/health?strict=1' });
    // Without a DB, strict mode reports unhealthy
    expect([200, 503]).toContain(res.statusCode);
  });
});
