/**
 * Shared backend types.
 *
 * Plain FastifyInstance; runtime validation lives inside each handler via
 * zod's `.parse()` (the global error handler converts ZodError → 422).
 */

import type { FastifyInstance } from 'fastify';

export type App = FastifyInstance;
