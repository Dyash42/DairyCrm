/**
 * Executives module — admin-managed.
 * GET    /executives          — list with assigned route
 * GET    /executives/:id      — detail
 * POST   /executives          — create User+Executive
 * PATCH  /executives/:id      — update user name/phone/active
 * DELETE /executives/:id      — deactivate (sets user.active=false)
 */

import type { App } from '../../types';
import { z } from 'zod';
import { UserRole } from '@prisma/client';
import { prisma } from '../../prisma';

const CreateBody = z.object({
  name: z.string().min(1),
  phone: z.string().min(10),
  email: z.string().email().optional(),
  routeId: z.string().nullable().optional(),
});

const PatchBody = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().min(10).optional(),
  email: z.string().email().nullable().optional(),
  routeId: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

export async function registerExecutiveRoutes(app: App) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async () => {
    const execs = await prisma.executive.findMany({
      include: { user: true, route: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      executives: execs.map((e) => ({
        id: e.id,
        name: e.user.name,
        phone: e.user.phone,
        email: e.user.email,
        active: e.user.active,
        routeId: e.routeId,
        routeName: e.route?.name ?? null,
      })),
    };
  });

  app.get('/:id', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const exec = await prisma.executive.findUnique({
        where: { id },
        include: { user: true, route: true },
      });
      if (!exec) return reply.status(404).send({ error: 'NotFound' });
      return exec;
    },
  });

  app.post('/', {
    handler: async (req, reply) => {
      const body = req.body as z.infer<typeof CreateBody>;
      try {
        const exec = await prisma.$transaction(async (tx) => {
          const user = await tx.user.create({
            data: {
              role: UserRole.EXECUTIVE,
              name: body.name,
              phone: body.phone,
              email: body.email ?? null,
            },
          });
          return tx.executive.create({
            data: {
              userId: user.id,
              routeId: body.routeId ?? null,
            },
            include: { user: true, route: true },
          });
        });
        return reply.status(201).send(exec);
      } catch (e: unknown) {
        if (e instanceof Error && (e as { code?: string }).code === 'P2002') {
          return reply.status(409).send({ error: 'Phone or email already in use' });
        }
        throw e;
      }
    },
  });

  app.patch('/:id', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as z.infer<typeof PatchBody>;
      const exec = await prisma.executive.findUnique({ where: { id } });
      if (!exec) return reply.status(404).send({ error: 'NotFound' });

      await prisma.$transaction(async (tx) => {
        if (body.name || body.phone || body.email !== undefined || body.active !== undefined) {
          await tx.user.update({
            where: { id: exec.userId },
            data: {
              ...(body.name && { name: body.name }),
              ...(body.phone && { phone: body.phone }),
              ...(body.email !== undefined && { email: body.email }),
              ...(body.active !== undefined && { active: body.active }),
            },
          });
        }
        if (body.routeId !== undefined) {
          await tx.executive.update({ where: { id }, data: { routeId: body.routeId } });
        }
      });
      const updated = await prisma.executive.findUnique({
        where: { id },
        include: { user: true, route: true },
      });
      return updated;
    },
  });

  app.delete('/:id', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const exec = await prisma.executive.findUnique({ where: { id } });
      if (!exec) return reply.status(404).send({ error: 'NotFound' });
      await prisma.user.update({ where: { id: exec.userId }, data: { active: false } });
      return { ok: true };
    },
  });
}
