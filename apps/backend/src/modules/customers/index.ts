/**
 * Customers module.
 *
 * Endpoints (all require ADMIN unless noted):
 *   GET    /customers                       — list with filter + search
 *   GET    /customers/by-code/:code         — resolve a scanned QR payload (mobile scanner)
 *   GET    /customers/:id                   — single customer
 *   GET    /customers/:id/detail            — aggregated subs + payments + pauses
 *   GET    /customers/:id/qr                — current QR data URL
 *   POST   /customers/:id/qr/regenerate     — revoke + reissue QR (audit row written)
 *   POST   /customers                       — create + allocate code + generate QR
 *   PATCH  /customers/:id                   — update mutable fields
 *   DELETE /customers/:id                   — soft-cancel (status=CANCELLED)
 */

import type { App } from '../../types';
import { z } from 'zod';
import { CustomerStatus, QrCodeStatus } from '@prisma/client';

import { prisma } from '../../prisma';
import { nextCustomerCode } from '../../services/customer-code';
import { generateQrDataUrl } from '../../services/qrcode';
import { notFound, isUniqueConstraintError } from '../../utils/http';
import { registerCustomerBulkRoutes } from './bulk';

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

  // Bulk import sub-router (template/validate/commit)
  await app.register(registerCustomerBulkRoutes, { prefix: '/bulk' });

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
      if (!customer) return notFound(reply, 'Customer');
      const dataUrl = await generateQrDataUrl(customer.code);
      return { code: customer.code, dataUrl };
    },
  });

  /** GET /customers/by-code/:code — the mobile scanner's primary lookup. */
  app.get('/by-code/:code', {
    handler: async (req, reply) => {
      const { code } = req.params as { code: string };
      const customer = await prisma.customer.findUnique({
        where: { code: code.trim().toUpperCase() },
      });
      if (!customer) return notFound(reply, 'Customer');
      return {
        id: customer.id,
        code: customer.code,
        name: customer.name,
        addressLine1: customer.addressLine1,
        litresPerDay: customer.litresPerDay,
        routeId: customer.routeId,
        status: customer.status,
      };
    },
  });

  /**
   * POST /customers/:id/qr/regenerate — admin invalidates the current QR and
   * issues a new one. Old QrCode row is marked REVOKED with the reason.
   *
   * NOTE: this issues a NEW visual encoding, but `customer.code` itself does
   * NOT change. The QR keeps encoding the same JHR-XXXXXX so existing
   * lookups still work; only the rendered image is fresh (different version).
   */
  app.post('/:id/qr/regenerate', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = req.body as { reason?: string } | undefined;
      const customer = await prisma.customer.findUnique({ where: { id } });
      if (!customer) return notFound(reply, 'Customer');

      const me = req.user;
      const result = await prisma.$transaction(async (tx) => {
        // Revoke previous active QR rows
        await tx.qrCode.updateMany({
          where: { customerId: id, status: QrCodeStatus.ACTIVE },
          data: {
            status: QrCodeStatus.REVOKED,
            revokedAt: new Date(),
            revokedBy: me.sub,
            reason: body?.reason ?? 'Regenerated by admin',
          },
        });

        // Pick next version number (max + 1)
        const last = await tx.qrCode.findFirst({
          where: { customerId: id },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        const version = (last?.version ?? 0) + 1;

        const dataUrl = await generateQrDataUrl(customer.code);
        const fresh = await tx.qrCode.create({
          data: {
            customerId: id,
            payload: customer.code,
            url: dataUrl,
            version,
            status: QrCodeStatus.ACTIVE,
          },
        });
        await tx.customer.update({
          where: { id },
          data: { qrCodeUrl: dataUrl },
        });
        return fresh;
      });

      return { ok: true, qr: result };
    },
  });

  app.post('/', {
    handler: async (req, reply) => {
      const body = req.body as z.infer<typeof CreateBody>;
      const code = await nextCustomerCode(prisma);
      const qrCodeUrl = await generateQrDataUrl(code);
      try {
        const customer = await prisma.$transaction(async (tx) => {
          const c = await tx.customer.create({
            data: { ...body, code, qrCodeUrl },
          });
          await tx.qrCode.create({
            data: {
              customerId: c.id,
              payload: code,
              url: qrCodeUrl,
              status: QrCodeStatus.ACTIVE,
              version: 1,
            },
          });
          return c;
        });
        return reply.status(201).send(customer);
      } catch (e: unknown) {
        if (isUniqueConstraintError(e)) {
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
