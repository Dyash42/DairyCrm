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
import { normalizePhone } from '../../utils/phone';
import { registerCustomerBulkRoutes } from './bulk';

const ListQuery = z.object({
  status: z.nativeEnum(CustomerStatus).optional(),
  routeId: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

/** Looser than strict E.164 — accepts the various input shapes (with or
 * without +, dashes, spaces, country code) but rejects strings that
 * obviously can't be a phone number ("lorem ipsum is 11 chars" used to
 * sneak through `min(10)`). */
const phoneSchema = z
  .string()
  .min(10)
  .max(20)
  .refine((s) => /^[+\d\s\-()]{10,20}$/.test(s) && (s.match(/\d/g)?.length ?? 0) >= 10, {
    message: 'Invalid phone number',
  });

const CreateBody = z.object({
  name: z.string().min(1),
  phone: phoneSchema,
  altPhone: phoneSchema.optional(),
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

  // Most customer endpoints are admin-only — listing the roster, viewing
  // details, mutating records. The one exception is GET /by-code/:code,
  // which the mobile scanner uses; that gets opted out below.
  const adminOnly = app.requireRole('ADMIN');

  // Bulk import sub-router (template/validate/commit) — admin only.
  await app.register(async (sub) => {
    sub.addHook('onRequest', adminOnly);
    await registerCustomerBulkRoutes(sub);
  }, { prefix: '/bulk' });

  /**
   * GET /customers/export.csv
   *
   * Streams all customers as a CSV using the same column shape as the
   * bulk-import template — so admins can export, edit in Excel, and
   * re-import without column drift. This is the "monthly backup" lever
   * before a real DB backup is set up.
   */
  app.get('/export.csv', {
    preHandler: adminOnly,
    handler: async (_req, reply) => {
      const customers = await prisma.customer.findMany({
        include: {
          route: { select: { name: true } },
          subscriptions: {
            where: { status: 'ACTIVE' },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              sku: true,
              daysOfWeek: true,
              startDate: true,
              endDate: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      });

      const csvEscape = (s: string | null | undefined): string => {
        if (s === null || s === undefined) return '';
        const str = String(s);
        if (str === '') return '';
        if (/[,"\r\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
        return str;
      };

      const header = [
        'name',
        'phone',
        'alt_phone',
        'email',
        'address_line1',
        'area',
        'pin_code',
        'route_name',
        'product_code',
        'litres_per_day',
        'days_of_week',
        'duration_days',
        'start_date',
        'customer_code',
        // Read-only columns useful in a backup but ignored by the importer
        'status',
        'balance',
      ];

      const lines = [header.join(',')];
      for (const c of customers) {
        const sub = c.subscriptions[0];
        const durationDays =
          sub && sub.endDate
            ? Math.max(
                1,
                Math.round(
                  (sub.endDate.getTime() - sub.startDate.getTime()) / 86_400_000,
                ),
              )
            : '';
        const dow = sub?.daysOfWeek ? (sub.daysOfWeek as number[]).join(',') : 'EVERY_DAY';

        lines.push(
          [
            csvEscape(c.name),
            csvEscape(c.phone),
            csvEscape(c.altPhone),
            csvEscape(c.email),
            csvEscape(c.addressLine1),
            csvEscape(c.area),
            csvEscape(c.pinCode),
            csvEscape(c.route?.name),
            csvEscape(sub?.sku ?? 'COW_MILK'),
            csvEscape(String(c.litresPerDay)),
            csvEscape(dow),
            csvEscape(String(durationDays)),
            csvEscape(sub ? sub.startDate.toISOString().slice(0, 10) : ''),
            csvEscape(c.code),
            csvEscape(c.status),
            csvEscape(String(c.balance)),
          ].join(','),
        );
      }

      const today = new Date().toISOString().slice(0, 10);
      reply
        .header('Content-Type', 'text/csv; charset=utf-8')
        .header(
          'Content-Disposition',
          `attachment; filename="jharanai-customers-${today}.csv"`,
        )
        .send(`${lines.join('\n')}\n`);
    },
  });

  app.get('/', {
    preHandler: adminOnly,
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
    preHandler: adminOnly,
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const customer = await prisma.customer.findUnique({ where: { id } });
      if (!customer) return reply.status(404).send({ error: 'NotFound' });
      return customer;
    },
  });

  app.get('/:id/detail', {
    preHandler: adminOnly,
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
    preHandler: adminOnly,
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
    preHandler: adminOnly,
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
    preHandler: adminOnly,
    handler: async (req, reply) => {
      const body = CreateBody.parse(req.body);
      // Normalize phone exactly like the bulk importer so single-create
      // and CSV import don't drift (the audit's M1 finding).
      body.phone = normalizePhone(body.phone);
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
    preHandler: adminOnly,
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = PatchBody.parse(req.body);
      if (body.phone) body.phone = normalizePhone(body.phone);
      const updated = await prisma.customer
        .update({ where: { id }, data: body })
        .catch(() => null);
      if (!updated) return reply.status(404).send({ error: 'NotFound' });
      return updated;
    },
  });

  app.delete('/:id', {
    preHandler: adminOnly,
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
