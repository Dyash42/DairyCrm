/**
 * Background worker process — separate from the HTTP server.
 *
 * Run alongside the API:
 *   npm run worker
 *
 * Schedules:
 *   - auto-resume          every  5 min — picks up due AutoResumeJob rows
 *   - renewal-reminder     every 15 min — pings customers 3 days before expiry
 *   - daily-route-gen      every 60 min — materializes today's deliveries
 *   - delivery-confirm     every 10 min — sends "delivered today" WhatsApp
 *   - scheduled-broadcasts every  5 min — fires SCHEDULED broadcasts when due
 *   - end-of-day-missed    every 60 min — flips past-PENDING → MISSED
 *   - expire-subscriptions every 60 min — flips ACTIVE → CANCELLED after endDate
 *
 * If REDIS_URL is unset we fall back to in-process setInterval so dev still
 * works without BullMQ/Redis. In production, REDIS_URL must be set.
 */

import http from 'node:http';

import { loadConfig } from '../config';
import { initObservability, captureException } from '../observability';
import {
  isJobsEnabled,
  getQueue,
  spawnWorker,
  QUEUE_NAMES,
  closeAllQueues,
  closeWorkers,
} from './queue';
import { runAutoResumeOnce } from './auto-resume';
import { runRenewalReminderOnce } from './renewal-reminder';
import { runDailyRouteGenOnce } from './daily-route-gen';
import { runDeliveryConfirmOnce } from './delivery-confirm';
import { runEndOfDayMissedOnce } from './end-of-day-missed';
import { runExpireSubscriptionsOnce } from './expire-subscriptions';
import { runScheduledBroadcastsOnce, runBroadcastSendOnce } from './scheduled-broadcasts';

const MIN = 60 * 1000;
const INTERVALS = {
  autoResume: 5 * MIN,
  renewalReminder: 15 * MIN,
  dailyRouteGen: 60 * MIN,
  deliveryConfirm: 10 * MIN,
  scheduledBroadcasts: 5 * MIN,
  // These two are heavier (table-scans) so we run them only hourly.
  // Their semantic clock is "once per day after the morning window",
  // but checking hourly gives us a quick recovery from a missed tick.
  endOfDayMissed: 60 * MIN,
  expireSubscriptions: 60 * MIN,
};

// Liveness: updated on every completed tick (see log()). The /health endpoint
// reports stale if no tick ran within the longest interval + slack, so the
// orchestrator can restart a wedged worker (audit PRO-07).
let lastTickAt = Date.now();

function startHealthServer(): void {
  const port = Number(process.env.WORKER_HEALTH_PORT) || 9091;
  http
    .createServer((req, res) => {
      if (req.url === '/health' || req.url === '/') {
        const ageMs = Date.now() - lastTickAt;
        const stale = ageMs > INTERVALS.dailyRouteGen + 5 * MIN;
        res.writeHead(stale ? 503 : 200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: !stale, lastTickAgeMs: ageMs }));
        return;
      }
      res.writeHead(404);
      res.end();
    })
    .listen(port, () => {
      // eslint-disable-next-line no-console
      console.log(`[worker] health endpoint on :${port}`);
    });
}

async function main() {
  await initObservability();
  const config = loadConfig();
  // eslint-disable-next-line no-console
  console.log(`[worker] starting (NODE_ENV=${config.NODE_ENV})`);
  startHealthServer();

  if (!isJobsEnabled()) {
    // eslint-disable-next-line no-console
    console.warn('[worker] REDIS_URL unset — running in-process setInterval mode');
    runInIntervalMode();
    return;
  }

  // BullMQ-backed mode — repeating jobs per queue
  await getQueue(QUEUE_NAMES.autoResume).add(
    'tick', {},
    { repeat: { every: INTERVALS.autoResume }, removeOnComplete: true, removeOnFail: 50 },
  );
  await getQueue(QUEUE_NAMES.renewalReminder).add(
    'tick', {},
    { repeat: { every: INTERVALS.renewalReminder }, removeOnComplete: true, removeOnFail: 50 },
  );
  await getQueue(QUEUE_NAMES.dailyRouteGen).add(
    'tick', {},
    { repeat: { every: INTERVALS.dailyRouteGen }, removeOnComplete: true, removeOnFail: 50 },
  );
  await getQueue(QUEUE_NAMES.deliveryConfirm).add(
    'tick', {},
    { repeat: { every: INTERVALS.deliveryConfirm }, removeOnComplete: true, removeOnFail: 50 },
  );
  await getQueue(QUEUE_NAMES.scheduledBroadcasts).add(
    'tick', {},
    { repeat: { every: INTERVALS.scheduledBroadcasts }, removeOnComplete: true, removeOnFail: 50 },
  );
  await getQueue(QUEUE_NAMES.endOfDayMissed).add(
    'tick', {},
    { repeat: { every: INTERVALS.endOfDayMissed }, removeOnComplete: true, removeOnFail: 50 },
  );
  await getQueue(QUEUE_NAMES.expireSubscriptions).add(
    'tick', {},
    { repeat: { every: INTERVALS.expireSubscriptions }, removeOnComplete: true, removeOnFail: 50 },
  );

  spawnWorker(QUEUE_NAMES.autoResume, async () => log('auto-resume', await runAutoResumeOnce()));
  spawnWorker(QUEUE_NAMES.renewalReminder, async () =>
    log('renewal-reminder', await runRenewalReminderOnce()),
  );
  spawnWorker(QUEUE_NAMES.dailyRouteGen, async () =>
    log('daily-route-gen', await runDailyRouteGenOnce()),
  );
  spawnWorker(QUEUE_NAMES.deliveryConfirm, async () =>
    log('delivery-confirm', await runDeliveryConfirmOnce()),
  );
  spawnWorker(QUEUE_NAMES.scheduledBroadcasts, async () =>
    log('scheduled-broadcasts', await runScheduledBroadcastsOnce()),
  );
  // Event-driven (not a repeating cron): jobs are enqueued by
  // POST /broadcasts/:id/send. Each job carries a broadcastId; the
  // worker runs the full send pipeline off the HTTP request thread
  // (audit ARC-04/INT-03/PER-05).
  spawnWorker<{ broadcastId: string }>(QUEUE_NAMES.broadcastSend, async (job) =>
    log('broadcast-send', await runBroadcastSendOnce(job.data.broadcastId)),
  );
  spawnWorker(QUEUE_NAMES.endOfDayMissed, async () =>
    log('end-of-day-missed', await runEndOfDayMissedOnce()),
  );
  spawnWorker(QUEUE_NAMES.expireSubscriptions, async () =>
    log('expire-subscriptions', await runExpireSubscriptionsOnce()),
  );

  // eslint-disable-next-line no-console
  console.log('[worker] BullMQ workers up');

  const shutdown = async () => {
    // eslint-disable-next-line no-console
    console.log('[worker] shutting down');
    // Drain + close workers BEFORE quitting the shared Redis connection so
    // in-flight jobs aren't abandoned (audit PRO-02).
    await closeWorkers();
    await closeAllQueues();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

/** Run a job once immediately (audit ARC-05: interval mode never ran at boot),
 *  then on each interval, always catching so one bad tick can't crash the
 *  process as an unhandled rejection (audit PRO-05). */
function schedule(name: string, fn: () => Promise<object>, interval: number): void {
  const run = () =>
    void fn()
      .then((r) => log(name, r))
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error(`[worker:${name}] tick failed`, err instanceof Error ? err.message : err);
        void captureException(err, { job: name });
      });
  run();
  setInterval(run, interval);
}

function runInIntervalMode() {
  schedule('auto-resume', runAutoResumeOnce, INTERVALS.autoResume);
  schedule('renewal-reminder', runRenewalReminderOnce, INTERVALS.renewalReminder);
  schedule('daily-route-gen', runDailyRouteGenOnce, INTERVALS.dailyRouteGen);
  schedule('delivery-confirm', runDeliveryConfirmOnce, INTERVALS.deliveryConfirm);
  schedule('scheduled-broadcasts', runScheduledBroadcastsOnce, INTERVALS.scheduledBroadcasts);
  schedule('end-of-day-missed', runEndOfDayMissedOnce, INTERVALS.endOfDayMissed);
  schedule('expire-subscriptions', runExpireSubscriptionsOnce, INTERVALS.expireSubscriptions);
}

function log(name: string, result: object) {
  lastTickAt = Date.now(); // heartbeat for the health endpoint
  const hasWork = Object.values(result).some((v) => typeof v === 'number' && v > 0);
  if (!hasWork) return;
  // eslint-disable-next-line no-console
  console.log(`[worker:${name}]`, result);
}

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[worker] failed to start', err);
  process.exit(1);
});
