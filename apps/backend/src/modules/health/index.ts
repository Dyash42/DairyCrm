import type { App } from '../../types';
import { prisma } from '../../prisma';

/**
 * Liveness probe: GET /health
 *   - always returns 200 with timestamp (process is up)
 *   - includes per-dependency status so load balancers / dashboards can
 *     distinguish "process alive but DB is down" from "all good".
 *
 * Set ?strict=1 to get a 503 if any dependency is unhealthy (use for
 * Kubernetes readiness probe; default returns 200 so the process isn't
 * killed for transient DB blips).
 */
export async function registerHealthRoutes(app: App) {
  app.get('/health', async (req, reply) => {
    const { strict } = req.query as { strict?: string };

    // DB ping — cheap select that uses an actual connection.
    let db: 'ok' | 'down' = 'ok';
    let dbLatencyMs: number | undefined;
    try {
      const t0 = Date.now();
      await prisma.$queryRaw`SELECT 1`;
      dbLatencyMs = Date.now() - t0;
    } catch {
      db = 'down';
    }

    const status = db === 'ok' ? 'ok' : 'degraded';
    const body = {
      status,
      service: 'jharanai-backend',
      timestamp: new Date().toISOString(),
      dependencies: { db, dbLatencyMs },
    };
    if (strict && status !== 'ok') {
      return reply.status(503).send(body);
    }
    return body;
  });
}
