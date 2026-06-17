/**
 * Backend entry point — starts the Fastify HTTP server.
 *
 * Run:
 *   npm run dev    # tsx watch
 *   npm start      # plain tsx
 *
 * Health: GET /health
 * OpenAPI / docs: not yet — add @fastify/swagger when needed.
 */

import { loadConfig } from './config';
import { buildServer } from './server';
import { initObservability, captureException } from './observability';
import { assertBootProviders } from './boot-guard';
import { prisma } from './prisma';

async function main() {
  const config = loadConfig();
  await initObservability();

  // Global safety net: a stray rejection/exception in a fire-and-forget path
  // (the WhatsApp webhook handler runs detached) must be reported, not silently
  // drop the process (audit PRO-05).
  process.on('unhandledRejection', (reason) => {
    captureException(reason);
    // eslint-disable-next-line no-console
    console.error('[unhandledRejection]', reason);
  });
  process.on('uncaughtException', (err) => {
    captureException(err);
    // eslint-disable-next-line no-console
    console.error('[uncaughtException]', err);
    process.exit(1);
  });

  const app = await buildServer();

  // Fail fast (prod) / warn (dev) if providers resolved to stubs or Redis is
  // missing — otherwise the platform runs invisibly broken (audit PRO-01).
  assertBootProviders(app.log);

  // Graceful shutdown: on a rolling deploy / scale-down the platform sends
  // SIGTERM then (after a grace period) SIGKILL. Drain in-flight requests and
  // close the Prisma pool instead of dropping open transactions + connections.
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    app.log.warn({ signal }, '[jharanai/backend] shutting down');
    try {
      await app.close();
      await prisma.$disconnect();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, 'error during shutdown');
      process.exit(1);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    app.log.warn({ port: config.PORT }, '[jharanai/backend] listening');
  } catch (err) {
    app.log.error({ err }, 'failed to start server');
    process.exit(1);
  }
}

void main();
