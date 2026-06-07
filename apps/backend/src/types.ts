/**
 * Shared backend types.
 *
 * Plain FastifyInstance; runtime validation lives inside each handler via
 * zod's `.parse()` (the global error handler converts ZodError → 422).
 */

import type { FastifyInstance } from 'fastify';

export type App = FastifyInstance;

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Populated by the per-route raw-body parser used in webhook modules.
     * NEVER use this for routes that don't explicitly register the parser —
     * it will be undefined.
     */
    rawBody?: string;
  }
}
