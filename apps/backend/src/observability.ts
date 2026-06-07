/**
 * Observability bootstrap — Sentry + structured error reporting.
 *
 * Sentry is loaded *dynamically* so the dependency is optional in dev /
 * CI. To enable in production:
 *   1. npm install @sentry/node
 *   2. Set SENTRY_DSN in .env
 *   3. Restart
 *
 * If either step is missing the app boots normally with errors going to
 * the Fastify logger.
 */

import { loadConfig } from './config';

let initialized = false;

export async function initObservability(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const dsn = loadConfig().SENTRY_DSN;
  if (!dsn) {
    // eslint-disable-next-line no-console
    console.log('[observability] SENTRY_DSN unset — error reporting disabled');
    return;
  }

  try {
    // Dynamic import: package may not be installed in dev.
    // @ts-expect-error optional dep
    const Sentry = await import('@sentry/node');
    Sentry.init({
      dsn,
      environment: loadConfig().NODE_ENV,
      // Env-configurable so we can crank up to 1.0 right after a deploy
      // and bring it back down once things are stable. Free Sentry tier
      // dies fast at 0.1 once traffic ramps.
      tracesSampleRate: loadConfig().SENTRY_TRACES_SAMPLE_RATE,
    });
    // eslint-disable-next-line no-console
    console.log('[observability] Sentry initialized');
  } catch {
    // eslint-disable-next-line no-console
    console.warn('[observability] @sentry/node not installed; run `npm i @sentry/node` to enable');
  }
}

/** Report an error if Sentry is up; otherwise no-op. Safe to call anywhere. */
export async function captureException(err: unknown, context?: Record<string, unknown>): Promise<void> {
  try {
    // @ts-expect-error optional dep
    const Sentry = await import('@sentry/node').catch(() => null);
    if (Sentry && typeof Sentry.captureException === 'function') {
      Sentry.captureException(err, { extra: context });
    }
  } catch {
    // swallow — observability must never break the request path
  }
}
