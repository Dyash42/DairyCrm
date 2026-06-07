/**
 * Tiny HTTP helpers — keep handlers concise.
 */

import type { FastifyReply } from 'fastify';

export function notFound(reply: FastifyReply, resource = 'Resource') {
  return reply.status(404).send({ error: 'NotFound', message: `${resource} not found` });
}

export function conflict(reply: FastifyReply, message = 'Conflict') {
  return reply.status(409).send({ error: 'Conflict', message });
}

export function forbidden(reply: FastifyReply) {
  return reply.status(403).send({ error: 'Forbidden' });
}

/** True when a Prisma error is the unique-constraint violation (P2002). */
export function isUniqueConstraintError(e: unknown): boolean {
  return e instanceof Error && (e as { code?: string }).code === 'P2002';
}
