/**
 * Products module — admin CRUDs sellable SKUs.
 *
 *   GET    /products          — list all (active first)
 *   GET    /products/:id      — single
 *   POST   /products          — create
 *   PATCH  /products/:id      — update
 *   DELETE /products/:id      — soft-delete (active=false)
 *
 * The whole point: admin can add ghee, butter, paneer, A2, etc. and set
 * rates without a code change.
 */

import type { App } from '../../types';
import { z } from 'zod';
import { ProductCategory } from '@prisma/client';

import { prisma } from '../../prisma';
import { notFound, isUniqueConstraintError } from '../../utils/http';

const CreateBody = z.object({
  code: z.string().min(1).max(40).regex(/^[A-Z0-9_]+$/, 'code must be UPPER_SNAKE_CASE'),
  name: z.string().min(1),
  description: z.string().optional(),
  category: z.nativeEnum(ProductCategory).default(ProductCategory.MILK),
  ratePerUnit: z.coerce.number().min(0.01).max(100000),
  unit: z.string().min(1).max(8).default('L'),
  active: z.boolean().default(true),
  imageUrl: z.string().url().optional(),
  sortOrder: z.coerce.number().int().default(0),
});

const PatchBody = CreateBody.partial();

export async function registerProductRoutes(app: App) {
  // Admin-only — pricing + catalog. Without this guard any EXECUTIVE
  // could create / rename / drop products or change ratePerUnit
  // (which is the price the bot quotes to customers).
  app.addHook('onRequest', app.authenticate);
  app.addHook('onRequest', app.requireRole('ADMIN'));

  app.get('/', async () => {
    const products = await prisma.product.findMany({
      orderBy: [{ active: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
    });
    return { products };
  });

  app.get('/:id', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const p = await prisma.product.findUnique({ where: { id } });
      if (!p) return notFound(reply, 'Product');
      return p;
    },
  });

  app.post('/', {
    handler: async (req, reply) => {
      const body = CreateBody.parse(req.body);
      const me = req.user;
      try {
        const created = await prisma.product.create({
          data: { ...body, updatedBy: me.sub },
        });
        return reply.status(201).send(created);
      } catch (e) {
        if (isUniqueConstraintError(e)) {
          return reply.status(409).send({ error: 'Product code already exists' });
        }
        throw e;
      }
    },
  });

  app.patch('/:id', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = PatchBody.parse(req.body);
      const me = req.user;
      const updated = await prisma.product
        .update({ where: { id }, data: { ...body, updatedBy: me.sub } })
        .catch(() => null);
      if (!updated) return notFound(reply, 'Product');
      return updated;
    },
  });

  app.delete('/:id', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      // Soft delete; existing subscriptions referencing it keep working
      const me = req.user;
      const updated = await prisma.product
        .update({
          where: { id },
          data: { active: false, updatedBy: me.sub },
        })
        .catch(() => null);
      if (!updated) return notFound(reply, 'Product');
      return { ok: true };
    },
  });
}
