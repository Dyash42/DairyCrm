/**
 * Admin-log module — receives observability events from the web admin
 * (page navigations, client-side errors) and surfaces them in the
 * backend log stream + log file, alongside backend's own events.
 *
 *   POST /admin-log/event   — single event { kind, path, message?, meta? }
 *
 * Why route client events through the backend rather than just
 * console.log-ing in the browser: when something breaks, the developer
 * (or future agent) reads ONE log file (apps/backend/logs/server.log)
 * and sees backend events interleaved with admin page-views in
 * timestamp order. No tab-juggling between browser devtools + terminal.
 *
 * Auth: JWT-required so an attacker can't pollute our logs from the
 * outside. Per-IP rate-limited to 60/min as a defense-in-depth.
 */

import type { App } from '../../types';
import { z } from 'zod';

const EventBody = z.object({
  kind: z.enum(['page-view', 'page-error', 'page-info']),
  path: z.string().min(1).max(500),
  message: z.string().max(2000).optional(),
  /** Free-form metadata — kept small so logs don't bloat. */
  meta: z.record(z.unknown()).optional(),
});

export async function registerAdminLogRoutes(app: App) {
  app.addHook('onRequest', app.authenticate);

  app.post('/event', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    handler: async (req, reply) => {
      const body = EventBody.parse(req.body);
      const me = req.user;
      // `req.log.info({...}, message)` — Pino routes this to the
      // multistream destination (stdout + the log file). Including
      // who the actor is so we can correlate clicks in the demo:
      // "admin=Anil Das visited /customers/clxyz at T".
      req.log.info(
        {
          adminLog: true,
          kind: body.kind,
          path: body.path,
          actor: me.name,
          actorId: me.sub,
          actorRole: me.role,
          ...body.meta,
        },
        body.message ?? `[admin] ${body.kind} ${body.path}`,
      );
      // 204 — no body, fastest acknowledgment.
      return reply.status(204).send();
    },
  });
}
