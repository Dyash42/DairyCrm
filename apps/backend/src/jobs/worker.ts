/**
 * Background worker process — separate from the HTTP server.
 *
 * Run alongside the API:
 *   npm run worker
 *
 * Schedules:
 *   - auto-resume   : every 5 minutes scans AutoResumeJob rows due now
 *   - (future)      : renewal-reminder, daily-route-gen, delivery-confirm
 *
 * If REDIS_URL is unset we fall back to in-process setInterval so dev still
 * works without BullMQ/Redis. In production, REDIS_URL must be set.
 */

import { loadConfig } from '../config';
import { initObservability } from '../observability';
import { isJobsEnabled, getQueue, spawnWorker, QUEUE_NAMES, closeAllQueues } from './queue';
import { runAutoResumeOnce } from './auto-resume';

const FIVE_MINUTES = 5 * 60 * 1000;

async function main() {
  await initObservability();
  const config = loadConfig();
  // eslint-disable-next-line no-console
  console.log(`[worker] starting (NODE_ENV=${config.NODE_ENV})`);

  if (!isJobsEnabled()) {
    // eslint-disable-next-line no-console
    console.warn('[worker] REDIS_URL unset — running in-process setInterval mode');
    setInterval(() => {
      void runAutoResumeOnce().then((r) => {
        if (r.picked > 0) {
          // eslint-disable-next-line no-console
          console.log('[worker:auto-resume]', r);
        }
      });
    }, FIVE_MINUTES);
    return;
  }

  // BullMQ-backed mode
  const queue = getQueue(QUEUE_NAMES.autoResume);
  // Repeating job: every 5 minutes.
  await queue.add(
    'tick',
    {},
    {
      repeat: { every: FIVE_MINUTES },
      removeOnComplete: true,
      removeOnFail: 50,
    },
  );

  spawnWorker(QUEUE_NAMES.autoResume, async () => {
    const r = await runAutoResumeOnce();
    if (r.picked > 0) {
      // eslint-disable-next-line no-console
      console.log('[worker:auto-resume]', r);
    }
  });

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

void main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[worker] failed to start', err);
  process.exit(1);
});
