/**
 * BullMQ queue + connection helpers.
 *
 * Single Redis connection shared by every queue. If REDIS_URL is unset
 * the worker logs a warning and runs no-ops — production must set it.
 */

import { Queue, Worker } from 'bullmq';
import IORedis from 'ioredis';

import { loadConfig } from '../config';

let redis: IORedis | null = null;

export function getRedis(): IORedis {
  if (redis) return redis;
  const url = loadConfig().REDIS_URL;
  if (!url) {
    throw new Error('REDIS_URL is required for background jobs');
  }
  redis = new IORedis(url, { maxRetriesPerRequest: null });
  return redis;
}

export function isJobsEnabled(): boolean {
  return Boolean(loadConfig().REDIS_URL);
}

// ---------------- Queue registry ----------------
//
// Each background concern gets its own queue so we can tune concurrency
// independently (e.g. WhatsApp send wants throttling; cron-tick doesn't).

export const QUEUE_NAMES = {
  autoResume: 'auto-resume',
  renewalReminder: 'renewal-reminder',
  dailyRouteGen: 'daily-route-gen',
  deliveryConfirm: 'delivery-confirm',
  broadcastSend: 'broadcast-send',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

const queues = new Map<QueueName, Queue>();

// BullMQ bundles its own ioredis types which differ slightly from the
// runtime ioredis we install. The instances are interchangeable; the cast
// is a type-only escape hatch.
function bullConnection(): { connection: unknown } {
  return { connection: getRedis() as unknown };
}

export function getQueue(name: QueueName): Queue {
  let q = queues.get(name);
  if (q) return q;
  q = new Queue(name, bullConnection() as never);
  queues.set(name, q);
  return q;
}

/** Spawn a worker for a queue. Caller owns the lifecycle. */
export function spawnWorker<T = unknown>(
  name: QueueName,
  handler: (job: { data: T }) => Promise<void>,
  opts: { concurrency?: number } = {},
): Worker<T> {
  const workerOpts = {
    connection: getRedis(),
    concurrency: opts.concurrency ?? 5,
  };
  return new Worker<T>(name, handler as never, workerOpts as never);
}

export async function closeAllQueues(): Promise<void> {
  for (const q of queues.values()) await q.close();
  if (redis) await redis.quit();
}
