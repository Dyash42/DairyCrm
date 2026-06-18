/**
 * Shared Redis client.
 *
 * The whole app uses ONE connection (BullMQ jobs, WhatsApp sessions, webhook
 * idempotency, OTP store, rate limiter). When REDIS_URL is unset the optional
 * getter returns null and every consumer falls back to its in-process
 * implementation — so dev/single-instance keeps working, while production with
 * Redis becomes multi-instance-safe (audit Theme A: ARC-01/PRO-03/INT-01/
 * EDG-01/EDG-09/CUS-06/BAC-10/SEC-05/PER-07).
 */
import IORedis from 'ioredis';

import { loadConfig } from './config';

let client: IORedis | null = null;
let attempted = false;

/** Shared client, or null when REDIS_URL is unset (callers fall back). */
export function getRedisOptional(): IORedis | null {
  if (attempted) return client;
  attempted = true;
  const url = loadConfig().REDIS_URL;
  if (!url) return null;
  client = new IORedis(url, { maxRetriesPerRequest: null });
  client.on('error', (err: unknown) => {
    // Never let a transient Redis blip throw an unhandled 'error' event.
    // eslint-disable-next-line no-console
    console.error('[redis] connection error:', err instanceof Error ? err.message : err);
  });
  return client;
}

/** Shared client; throws if REDIS_URL is unset (required consumers, e.g. BullMQ). */
export function getRedis(): IORedis {
  const c = getRedisOptional();
  if (!c) throw new Error('REDIS_URL is required for background jobs');
  return c;
}

export function isRedisEnabled(): boolean {
  return Boolean(loadConfig().REDIS_URL);
}

export async function closeRedis(): Promise<void> {
  if (client) {
    await client.quit();
    client = null;
    attempted = false;
  }
}

/** Tests only — drop the cached client so a new REDIS_URL is picked up. */
export function _resetRedisForTests(): void {
  client = null;
  attempted = false;
}
