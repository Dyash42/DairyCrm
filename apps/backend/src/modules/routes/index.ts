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
  app.addHook('onRequest', app.authenticate);

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
      return route;
    },
  });

  app.post('/', {
    handler: async (req, reply) => {
      try {
        const created = await prisma.route.create({
          data: req.body as z.infer<typeof CreateBody>,
        });
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
      const updated = await prisma.route
        .update({ where: { id }, data: req.body as z.infer<typeof PatchBody> })
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
      await prisma.route.delete({ where: { id } }).catch(() => null);
      return { ok: true };
    },
  });

  app.post('/:id/executive', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const { executiveId } = req.body as z.infer<typeof AssignBody>;

      // Unassign whoever is currently on this route
      const prev = await prisma.executive.findFirst({ where: { routeId: id } });
      if (prev && prev.id !== executiveId) {
        await prisma.executive.update({ where: { id: prev.id }, data: { routeId: null } });
      }
      if (executiveId) {
        await prisma.executive.update({ where: { id: executiveId }, data: { routeId: id } });
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
