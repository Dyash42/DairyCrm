/**
 * Routes module — admin-only.
 * GET /routes               — list with assigned executive + customer count
 * GET /routes/:id           — detail with assigned customers
 * POST /routes              — create
 * PATCH /routes/:id         — update
 * DELETE /routes/:id        — delete (only if no customers assigned)
 * POST /routes/:id/executive — assign executive (re-assignable, simple FK)
 */

import type { App } from '../../types';
import { z } from 'zod';
import { prisma } from '../../prisma';

const CreateBody = z.object({
  name: z.string().min(1),
  area: z.string().min(1),
  pinCodes: z.array(z.string()).default([]),
});

const PatchBody = CreateBody.partial();

const AssignBody = z.object({
  executiveId: z.string().nullable(),
});

export async function registerRouteRoutes(app: App) {
  // Admin-only — routes are an operations surface, not a milkman one.
  // Without this guard any authenticated EXECUTIVE could create routes,
  // reassign themselves via POST /:id/executive, or delete routes
  // (the customer-count guard would protect populated routes but a fresh
  // empty route is still deletable).
  app.addHook('onRequest', app.authenticate);
  app.addHook('onRequest', app.requireRole('ADMIN'));

  app.get('/', {
    handler: async () => {
      const routes = await prisma.route.findMany({
        include: {
          executive: { include: { user: true } },
          _count: { select: { customers: true } },
        },
        orderBy: { name: 'asc' },
      });
      return {
        routes: routes.map((r) => ({
          id: r.id,
          name: r.name,
          area: r.area,
          pinCodes: r.pinCodes,
          customerCount: r._count.customers,
          executive: r.executive
            ? { id: r.executive.id, name: r.executive.user.name }
            : null,
        })),
      };
    },
  });

  app.get('/:id', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const route = await prisma.route.findUnique({
        where: { id },
        include: {
          executive: { include: { user: true } },
          customers: {
            orderBy: { routeSeq: 'asc' },
            select: {
              id: true,
              code: true,
              name: true,
              addressLine1: true,
              routeSeq: true,
              status: true,
              litresPerDay: true,
            },
          },
        },
      });
      if (!route) return reply.status(404).send({ error: 'NotFound' });

      // PRD §5.1.4: surface the recent reassignment history (most recent
      // first), resolving executive ids to names for display.
      const history = await prisma.routeAssignment.findMany({
        where: { routeId: id },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });
      const execIds = Array.from(
        new Set(
          history
            .flatMap((h) => [h.executiveId, h.previousExecutiveId])
            .filter((x): x is string => !!x),
        ),
      );
      const execs = execIds.length
        ? await prisma.executive.findMany({
            where: { id: { in: execIds } },
            include: { user: { select: { name: true } } },
          })
        : [];
      const execName = new Map(execs.map((e) => [e.id, e.user.name]));
      const assignmentHistory = history.map((h) => ({
        id: h.id,
        at: h.createdAt.toISOString(),
        executive: h.executiveId ? execName.get(h.executiveId) ?? 'Unknown' : null,
        previousExecutive: h.previousExecutiveId
          ? execName.get(h.previousExecutiveId) ?? 'Unknown'
          : null,
      }));
      return { ...route, assignmentHistory };
    },
  });

  app.post('/', {
    handler: async (req, reply) => {
      const body = CreateBody.parse(req.body);
      try {
        const created = await prisma.route.create({ data: body });
        return reply.status(201).send(created);
      } catch (e: unknown) {
        if (e instanceof Error && (e as { code?: string }).code === 'P2002') {
          return reply.status(409).send({ error: 'Route name already exists' });
        }
        throw e;
      }
    },
  });

  app.patch('/:id', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = PatchBody.parse(req.body);
      const updated = await prisma.route
        .update({ where: { id }, data: body })
        .catch(() => null);
      if (!updated) return reply.status(404).send({ error: 'NotFound' });
      return updated;
    },
  });

  app.delete('/:id', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const count = await prisma.customer.count({ where: { routeId: id } });
      if (count > 0) {
        return reply.status(409).send({
          error: 'RouteHasCustomers',
          message: `Reassign ${count} customers before deleting.`,
        });
      }
      // Delivery.routeId is ON DELETE RESTRICT, so a route that ever had
      // deliveries can't be hard-deleted. Previously the FK error was swallowed
      // (`.catch(() => null)`) and we returned {ok:true} — a false success the
      // admin saw, then the route reappeared on refresh (audit DAT-04). Check
      // explicitly and surface a real 409; propagate unexpected errors.
      const deliveries = await prisma.delivery.count({ where: { routeId: id } });
      if (deliveries > 0) {
        return reply.status(409).send({
          error: 'RouteHasDeliveries',
          message: `Route has ${deliveries} historical deliveries and cannot be deleted.`,
        });
      }
      try {
        await prisma.route.delete({ where: { id } });
      } catch (e: unknown) {
        if ((e as { code?: string }).code === 'P2025') {
          return reply.status(404).send({ error: 'NotFound' });
        }
        throw e;
      }
      return { ok: true };
    },
  });

  app.post('/:id/executive', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const { executiveId } = AssignBody.parse(req.body);

      // Whole reassignment runs in one transaction. Otherwise two admins
      // assigning concurrently could leave the route with two execs
      // pointing at it (or orphan both). Executive.routeId has @unique
      // so collisions surface as a unique-constraint error — convert to
      // a 409 the admin UI can show.
      try {
        await prisma.$transaction(async (tx) => {
          const prev = await tx.executive.findFirst({ where: { routeId: id } });
          const prevId = prev?.id ?? null;
          if (prev && prev.id !== executiveId) {
            await tx.executive.update({
              where: { id: prev.id },
              data: { routeId: null },
            });
          }
          if (executiveId) {
            // If the new exec is already on another route, clear it
            // first inside the same tx so the assignment can land.
            await tx.executive.update({
              where: { id: executiveId },
              data: { routeId: id },
            });
          }
          // PRD §5.1.4: append to the route↔executive reassignment history,
          // atomically with the change, but only when it actually changed.
          if (prevId !== (executiveId ?? null)) {
            await tx.routeAssignment.create({
              data: {
                routeId: id,
                executiveId: executiveId ?? null,
                previousExecutiveId: prevId,
                changedBy: req.user.sub,
              },
            });
          }
        });
      } catch (e: unknown) {
        const code = (e as { code?: string }).code;
        if (code === 'P2002') {
          return reply.status(409).send({
            error: 'Conflict',
            message: 'Executive is already assigned to another route',
          });
        }
        throw e;
      }

      const route = await prisma.route.findUnique({
        where: { id },
        include: { executive: { include: { user: true } } },
      });
      if (!route) return reply.status(404).send({ error: 'NotFound' });
      return route;
    },
  });
}
