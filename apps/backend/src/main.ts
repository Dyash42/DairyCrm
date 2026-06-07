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
import { initObservability } from './observability';

async function main() {
  const config = loadConfig();
  await initObservability();
  const app = await buildServer();

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
    app.log.warn({ port: config.PORT }, '[jharanai/backend] listening');
  } catch (err) {
    app.log.error({ err }, 'failed to start server');
    process.exit(1);
  }
}

void main();
