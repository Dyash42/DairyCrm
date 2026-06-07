/**
 * Background worker process — separate from the HTTP server.
 *
 * Run alongside the API:
 *   npm run worker
 *
 * Schedules:
 *   - auto-resume        every  5 min — picks up due AutoResumeJob rows
 *   - renewal-reminder   every 15 min — pings customers 3 days before expiry
 *   - daily-route-gen    every 60 min — materializes today's deliveries
 *   - delivery-confirm   every 10 min — sends "delivered today" WhatsApp
 *
 * If REDIS_URL is unset we fall back to in-process setInterval so dev still
 * works without BullMQ/Redis. In production, REDIS_URL must be set.
 */

import { loadConfig } from '../config';
import { initObservability } from '../observability';
import { isJobsEnabled, getQueue, spawnWorker, QUEUE_NAMES, closeAllQueues } from './queue';
import { runAutoResumeOnce } from './auto-resume';
import { runRenewalReminderOnce } from './renewal-reminder';
import { runDailyRouteGenOnce } from './daily-route-gen';
import { runDeliveryConfirmOnce } from './delivery-confirm';

const MIN = 60 * 1000;
const INTERVALS = {
  autoResume: 5 * MIN,
  renewalReminder: 15 * MIN,
  dailyRouteGen: 60 * MIN,
  deliveryConfirm: 10 * MIN,
};

async function main() {
  await initObservability();
  const config = loadConfig();
  // eslint-disable-next-line no-console
  console.log(`[worker] starting (NODE_ENV=${config.NODE_ENV})`);

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

  // eslint-disable-next-line no-console
  console.log('[worker] BullMQ workers up');

  const shutdown = async () => {
    // eslint-disable-next-line no-console
    console.log('[worker] shutting down');
    await closeAllQueues();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

function runInIntervalMode() {
  setInterval(() => void runAutoResumeOnce().then((r) => log('auto-resume', r)),
    INTERVALS.autoResume);
  setInterval(() => void runRenewalReminderOnce().then((r) => log('renewal-reminder', r)),
    INTERVALS.renewalReminder);
  setInterval(() => void runDailyRouteGenOnce().then((r) => log('daily-route-gen', r)),
    INTERVALS.dailyRouteGen);
  setInterval(() => void runDeliveryConfirmOnce().then((r) => log('delivery-confirm', r)),
    INTERVALS.deliveryConfirm);
}

function log(name: string, result: object) {
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
