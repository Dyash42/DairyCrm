/**
 * Customers module.
 *
 * Endpoints (all require ADMIN unless noted):
 *   GET    /customers                       — list with filter + search
 *   GET    /customers/:id                   — single customer
 *   GET    /customers/:id/detail            — aggregated subs + payments + pauses
 *   GET    /customers/:id/qr                — QR data URL for the customer's code
 *   POST   /customers                       — create + allocate code + generate QR
 *   PATCH  /customers/:id                   — update mutable fields
 *   DELETE /customers/:id                   — soft-cancel (status=CANCELLED)
 */

import type { App } from '../../types';
import { z } from 'zod';
import { CustomerStatus } from '@prisma/client';

import { prisma } from '../../prisma';
import { nextCustomerCode } from '../../services/customer-code';
import { generateQrDataUrl } from '../../services/qrcode';

const ListQuery = z.object({
  status: z.nativeEnum(CustomerStatus).optional(),
  routeId: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

const CreateBody = z.object({
  name: z.string().min(1),
  phone: z.string().min(10),
  altPhone: z.string().optional(),
  email: z.string().email().optional(),
  addressLine1: z.string().min(1),
  addressLine2: z.string().optional(),
  area: z.string().optional(),
  pinCode: z.string().optional(),
  routeId: z.string().optional(),
  litresPerDay: z.coerce.number().min(0).max(50).default(1),
});

const PatchBody = CreateBody.partial();

export async function registerCustomerRoutes(app: App) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', {
    handler: async (req) => {
      const q = req.query as z.infer<typeof ListQuery>;
      const where: Record<string, unknown> = {};
      if (q.status) where.status = q.status;
      if (q.routeId) where.routeId = q.routeId;
      if (q.q) {
        where.OR = [
          { name: { contains: q.q, mode: 'insensitive' } },
          { code: { contains: q.q.toUpperCase() } },
          { phone: { contains: q.q } },
          { addressLine1: { contains: q.q, mode: 'insensitive' } },
        ];
      }
      const rows = await prisma.customer.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: q.limit + 1,
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });
      const nextCursor = rows.length > q.limit ? rows[q.limit]?.id : null;
      return { customers: rows.slice(0, q.limit), nextCursor };
    },
  });

  app.get('/:id', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const customer = await prisma.customer.findUnique({ where: { id } });
      if (!customer) return reply.status(404).send({ error: 'NotFound' });
      return customer;
    },
  });

  app.get('/:id/detail', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const customer = await prisma.customer.findUnique({
        where: { id },
        include: {
          route: true,
          subscriptions: { orderBy: { createdAt: 'desc' } },
          payments: { orderBy: { createdAt: 'desc' }, take: 20 },
          pauses: { orderBy: { startDate: 'desc' }, take: 20 },
        },
      });
      if (!customer) return reply.status(404).send({ error: 'NotFound' });
      return customer;
    },
  });

  app.get('/:id/qr', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const customer = await prisma.customer.findUnique({ where: { id } });
      if (!customer) return reply.status(404).send({ error: 'NotFound' });
      const dataUrl = await generateQrDataUrl(customer.code);
      return { code: customer.code, dataUrl };
    },
  });

  app.post('/', {
    handler: async (req, reply) => {
      const body = req.body as z.infer<typeof CreateBody>;
      const code = await nextCustomerCode(prisma);
      const qrCodeUrl = await generateQrDataUrl(code);
      try {
        const customer = await prisma.customer.create({
          data: { ...body, code, qrCodeUrl },
        });
        return reply.status(201).send(customer);
      } catch (e: unknown) {
        if (
          e instanceof Error &&
          'code' in e &&
          (e as { code: string }).code === 'P2002'
        ) {
          return reply.status(409).send({ error: 'Phone already registered' });
        }
        throw e;
      }
    },
  });

  app.patch('/:id', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const updated = await prisma.customer.update({
        where: { id },
        data: req.body as z.infer<typeof PatchBody>,
      }).catch(() => null);
      if (!updated) return reply.status(404).send({ error: 'NotFound' });
      return updated;
    },
  });

  app.delete('/:id', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const updated = await prisma.customer.update({
        where: { id },
        data: { status: CustomerStatus.CANCELLED },
      }).catch(() => null);
      if (!updated) return reply.status(404).send({ error: 'NotFound' });
      return { ok: true };
    },
  });
}
