/**
 * Singleton Prisma client.
 *
 * Why a module-scoped singleton (and not `new PrismaClient()` per request):
 *   - one DB connection pool per Node process
 *   - safe in dev with hot reload (we re-use the existing instance)
 *
 * Usage:
 *   import { prisma } from './prisma';
 *   const customer = await prisma.customer.findUnique({ where: { id } });
 *
 * When NestJS is wired back in, this gets wrapped as a PrismaService with
 * OnModuleInit / OnModuleDestroy hooks — the underlying client stays the same.
 */

import { PrismaClient } from '@prisma/client';

declare global {
  // eslint-disable-next-line no-var
  var __jharanaiPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__jharanaiPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['warn', 'error']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.__jharanaiPrisma = prisma;
}
