/**
 * BullMQ queue + connection helpers.
 *
 * Single Redis connection shared by every queue. If REDIS_URL is unset
 * the worker logs a warning and runs no-ops — production must set it.
 */

import { Queue, Worker } from 'bullmq';

import { loadConfig } from '../config';
import { captureException } from '../observability';
import { closeRedis, getRedis } from '../redis';

// Re-exported for back-compat with existing job imports.
export { getRedis } from '../redis';

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
  // Added in Phase 7 of the post-audit code track:
  endOfDayMissed: 'end-of-day-missed',
  expireSubscriptions: 'expire-subscriptions',
  scheduledBroadcasts: 'scheduled-broadcasts',
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

// Track every spawned worker so shutdown can drain + close them BEFORE the
// shared Redis connection is quit (audit PRO-02: SIGTERM never closed the
// workers and quit Redis out from under in-flight jobs).
const workers: Worker[] = [];

/** Spawn a worker for a queue. Lifecycle is managed via closeWorkers(). */
export function spawnWorker<T = unknown>(
  name: QueueName,
  handler: (job: { data: T }) => Promise<void>,
  opts: { concurrency?: number } = {},
): Worker<T> {
  const workerOpts = {
    connection: getRedis(),
    concurrency: opts.concurrency ?? 5,
  };
  const w = new Worker<T>(name, handler as never, workerOpts as never);
  // Attach error/failed listeners (audit PRO-06): an unhandled 'error' event
  // can crash the process, and silent 'failed' jobs hid Redis disconnects +
  // cron failures from any alerting.
  w.on('error', (err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[worker:${name}] error`, err instanceof Error ? err.message : err);
    void captureException(err, { queue: name });
  });
  w.on('failed', (job: { id?: string } | undefined, err: unknown) => {
    // eslint-disable-next-line no-console
    console.error(`[worker:${name}] job failed`, err instanceof Error ? err.message : err);
    void captureException(err, { queue: name, jobId: job?.id });
  });
  workers.push(w as Worker);
  return w;
}

/** Gracefully drain + close all workers (call before closeAllQueues). */
export async function closeWorkers(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  workers.length = 0;
}

export async function closeAllQueues(): Promise<void> {
  for (const q of queues.values()) await q.close();
  await closeRedis();
}
