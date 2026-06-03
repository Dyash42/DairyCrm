/**
 * Backend entry point — placeholder.
 *
 * NestJS modules and HTTP bootstrap will be wired in once `@nestjs/*` deps
 * are reinstalled (held back temporarily due to a transitive resolution
 * issue we'll fix in the next iteration).
 *
 * Until then, the backend's job is:
 *   - own the Prisma schema (single source of truth for the data layer)
 *   - provide a typed Prisma client to other apps via packages/shared (later)
 *   - run migrations + seed via `npm run db:*` scripts
 */

import { prisma } from './prisma';

async function main() {
  // eslint-disable-next-line no-console
  console.log('[jharanai/backend] placeholder bootstrap — Prisma reachable.');
  await prisma.$connect();
  await prisma.$disconnect();
}

void main().catch((e: unknown) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
