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
import {
  CustomerStatus,
  QrCodeStatus,
  SubscriptionStatus,
  RenewalReminderStatus,
  DeliveryStatus,
  PaymentStatus,
  Prisma,
} from '@prisma/client';

import { prisma } from '../../prisma';
import { nextCustomerCode } from '../../services/customer-code';
import {
  generateQrDataUrl,
  generateQrPng,
  buildVersionedQrPayload,
  parseVersionedQrPayload,
} from '../../services/qrcode';
import { settings } from '../../services/settings';
import { DEFAULT_RATE_PER_LITRE_INR } from '../../constants';
import { startOfBusinessDayUTC } from '../../utils/dates';
import { notFound, isUniqueConstraintError } from '../../utils/http';
import { normalizePhone } from '../../utils/phone';
import { registerCustomerBulkRoutes } from './bulk';

const ListQuery = z.object({
  status: z.nativeEnum(CustomerStatus).optional(),
  routeId: z.string().optional(),
  // EDG-04/BAC-08: surface ACTIVE customers with an ACTIVE subscription but no
  // route — they're billing-eligible yet never get a Delivery row (the
  // materializer skips routeId === null), so they're silently undelivered +
  // unbilled until assigned. `?unrouted=true` returns exactly that at-risk set.
  unrouted: z.enum(['true', 'false']).optional(),
  // PRD §5.2: filter by area. Case-insensitive substring on Customer.area.
  area: z.string().trim().min(1).max(100).optional(),
  // Min length 3 — a 2-char query like '99' matched every customer
  // whose phone contains those digits. With 400-500 customers a few
  // shorthand queries dumped the whole table. Strict ≥ 3 chars.
  q: z.string().trim().min(3).max(100).optional(),
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
  // Public, UNauthenticated QR image. Registered in its own encapsulated
  // scope BEFORE the auth hook below so it does NOT inherit it — the WhatsApp
  // Cloud API must be able to fetch this URL to deliver the onboarding QR
  // (Meta rejects data: URIs). The :id is an unguessable cuid and the payload
  // only encodes the customer code the milkman scans at the door anyway.
  await app.register(async (pub) => {
    pub.get('/:id/qr.png', {
      config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
      handler: async (req, reply) => {
        const { id } = req.params as { id: string };
        const customer = await prisma.customer.findUnique({
          where: { id },
          select: { code: true },
        });
        if (!customer) return reply.status(404).send({ error: 'NotFound' });
        const activeQr = await prisma.qrCode.findFirst({
          where: { customerId: id, status: QrCodeStatus.ACTIVE },
          orderBy: { version: 'desc' },
        });
        const payload = activeQr?.payload ?? customer.code;
        const png = await generateQrPng(payload);
        return reply
          .header('Content-Type', 'image/png')
          .header('Cache-Control', 'public, max-age=86400')
          .send(png);
      },
    });
  });

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
      const q = ListQuery.parse(req.query);
      const where: Record<string, unknown> = {};
      if (q.status) where.status = q.status;
      if (q.routeId) where.routeId = q.routeId;
      if (q.unrouted === 'true') {
        // The at-risk set (EDG-04/BAC-08): no route AND an ACTIVE subscription.
        // Overrides any routeId filter (mutually exclusive by definition).
        where.routeId = null;
        where.subscriptions = { some: { status: SubscriptionStatus.ACTIVE } };
      }
      if (q.area) where.area = { contains: q.area, mode: 'insensitive' };
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
        include: { route: { select: { name: true } } },
        ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
      });
      const nextCursor = rows.length > q.limit ? rows[q.limit]?.id : null;
      const pageRows = rows.slice(0, q.limit);

      // Derive "outstanding" from the ledger instead of the broken
      // Customer.balance field, which only ever incremented so the "owes
      // money" indicator could never fire (audit DAT-02). outstanding =
      // Σ(delivered litres × rate) − Σ(PAID payments). Two scoped aggregate
      // queries for the whole page (no N+1).
      const ids = pageRows.map((c) => c.id);
      const outstanding = new Map<string, number>();
      if (ids.length > 0) {
        const [billedRows, paidRows] = await Promise.all([
          prisma.$queryRaw<{ customerId: string; billed: number }[]>`
            SELECT "customerId", COALESCE(SUM("deliveredLitres" * "ratePerLitre"), 0)::float8 AS billed
            FROM "Delivery"
            WHERE "customerId" IN (${Prisma.join(ids)})
              AND "status" IN ('DELIVERED', 'PARTIAL')
            GROUP BY "customerId"`,
          prisma.payment.groupBy({
            by: ['customerId'],
            where: { customerId: { in: ids }, status: PaymentStatus.PAID },
            _sum: { amount: true },
          }),
        ]);
        const billedMap = new Map(billedRows.map((r) => [r.customerId, Number(r.billed)]));
        const paidMap = new Map(paidRows.map((r) => [r.customerId, Number(r._sum.amount ?? 0)]));
        for (const id of ids) {
          outstanding.set(id, Math.round((billedMap.get(id) ?? 0) - (paidMap.get(id) ?? 0)));
        }
      }

      return {
        customers: pageRows.map((c) => ({
          ...c,
          routeName: c.route?.name ?? null,
          outstanding: outstanding.get(c.id) ?? 0,
        })),
        nextCursor,
      };
    },
  });

  // Save a customer's door pin (GPS captured by the delivery partner at the
  // door, or admin correction). Any authenticated user — no adminOnly guard —
  // so executives can capture on first delivery.
  app.post('/:id/location', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const body = z
        .object({
          lat: z.coerce.number().min(-90).max(90),
          lng: z.coerce.number().min(-180).max(180),
        })
        .parse(req.body);
      const target = await prisma.customer.findUnique({
        where: { id },
        select: { id: true, routeId: true },
      });
      if (!target) return notFound(reply, 'Customer');
      // IDOR guard (audit SEC-02): an EXECUTIVE may only write the pin of a
      // customer on their OWN route — same boundary as /confirm and /skip.
      // Without this, any executive could overwrite ANY customer's GPS (ids
      // are returned in /deliveries/today) and misroute other milkmen.
      // Respond 404 (not 403) so the endpoint doesn't confirm the id exists.
      if (req.user.role === 'EXECUTIVE') {
        const exec = await prisma.executive.findFirst({
          where: { userId: req.user.sub },
          select: { routeId: true },
        });
        if (!exec?.routeId || exec.routeId !== target.routeId) {
          return notFound(reply, 'Customer');
        }
      }
      await prisma.customer.update({
        where: { id },
        data: { lat: body.lat, lng: body.lng, geoUpdatedAt: new Date() },
      });
      return { ok: true };
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

  /**
   * GET /customers/by-code/:code — the mobile scanner's primary lookup.
   *
   * EXECUTIVE callers are restricted to customers on their own route.
   * Without this guard, any milkman could iterate JHR-1XXXXX codes and
   * enumerate the entire customer table's name + address + phone.
   * ADMIN is unrestricted (they need to debug arbitrary scans).
   */
  app.get('/by-code/:code', {
    handler: async (req, reply) => {
      const { code: rawCode } = req.params as { code: string };
      // Parse versioned payload `JHR-100455:v3`. Legacy unversioned
      // codes (`JHR-100455`) get scannedVersion = null and skip the
      // version check — they only worked before regenerate.
      const trimmed = rawCode.trim().toUpperCase();
      const parsed = parseVersionedQrPayload(trimmed);
      const customerCode = parsed?.customerCode ?? trimmed;
      const scannedVersion = parsed?.version ?? null;

      const customer = await prisma.customer.findUnique({
        where: { code: customerCode },
      });
      if (!customer) return notFound(reply, 'Customer');

      // If the payload was versioned, verify the QR row is still
      // ACTIVE at that version. A revoked QR scans to its old version
      // number which no longer matches the currently-ACTIVE row, so
      // we 404 — the "regenerate" admin action now genuinely
      // invalidates the old printed sticker.
      if (scannedVersion !== null) {
        const activeQr = await prisma.qrCode.findFirst({
          where: { customerId: customer.id, status: 'ACTIVE' },
          orderBy: { version: 'desc' },
          select: { version: true },
        });
        if (!activeQr || activeQr.version !== scannedVersion) {
          return reply.status(410).send({
            error: 'QrRevoked',
            message: 'This QR has been replaced. Ask the customer for the latest sticker.',
          });
        }
      }

      const me = req.user;
      if (me.role === 'EXECUTIVE') {
        const exec = await prisma.executive.findFirst({
          where: { userId: me.sub },
          select: { routeId: true },
        });
        // Treat off-route lookups as 404 (not 403) so an attacker
        // can't distinguish "exists on another route" from "doesn't
        // exist at all" — same shape as a genuine missing code.
        if (!exec?.routeId || customer.routeId !== exec.routeId) {
          return notFound(reply, 'Customer');
        }
      }
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

        // Encode the version IN the QR payload so the scanner can
        // detect a stale printed sticker. The previous regenerate
        // re-encoded the same `customer.code`, so old printed QR
        // stickers still scanned successfully — the security boundary
        // was theatre. Versioned payload + by-code verifier is the fix.
        const versionedPayload = buildVersionedQrPayload(customer.code, version);
        const dataUrl = await generateQrDataUrl(versionedPayload);
        const fresh = await tx.qrCode.create({
          data: {
            customerId: id,
            payload: versionedPayload,
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
      // v1 QR — versioned from the start so regenerate-then-scan-old
      // works correctly. New mobile scanners parse both forms.
      const versionedPayload = buildVersionedQrPayload(code, 1);
      const qrCodeUrl = await generateQrDataUrl(versionedPayload);

      // A single-create customer also needs an ACTIVE subscription, exactly
      // like the bulk import and WhatsApp onboarding paths — otherwise the
      // route materializer never schedules them and they NEVER appear on the
      // milkman's Today's Route despite being "added". Defaults: daily cow
      // milk for the configured subscription length. Admin can refine later.
      const durationDays = await settings.getNumber('subscription.default_duration_days', 30);
      const renewalLeadDays = await settings.getNumber('subscription.renewal_reminder_days_before', 3);
      let product = await prisma.product.findFirst({ where: { code: 'COW_MILK' } });
      if (!product) {
        product = await prisma.product.findFirst({
          where: { active: true },
          orderBy: { sortOrder: 'asc' },
        });
      }
      const rate = Number(product?.ratePerUnit) || DEFAULT_RATE_PER_LITRE_INR;
      const startDate = startOfBusinessDayUTC();
      const endDate = new Date(startDate);
      endDate.setUTCDate(endDate.getUTCDate() + durationDays);
      const dueDate = new Date(endDate);
      dueDate.setUTCDate(dueDate.getUTCDate() - renewalLeadDays);

      try {
        const customer = await prisma.$transaction(async (tx) => {
          const c = await tx.customer.create({
            data: { ...body, code, qrCodeUrl },
          });
          await tx.qrCode.create({
            data: {
              customerId: c.id,
              payload: versionedPayload,
              url: qrCodeUrl,
              status: QrCodeStatus.ACTIVE,
              version: 1,
            },
          });
          const sub = await tx.subscription.create({
            data: {
              customerId: c.id,
              productId: product?.id ?? null,
              sku: product?.code ?? 'COW_MILK',
              litresPerDay: body.litresPerDay,
              daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
              ratePerLitre: rate,
              startDate,
              endDate,
              status: SubscriptionStatus.ACTIVE,
            },
          });
          await tx.renewalReminder.create({
            data: {
              subscriptionId: sub.id,
              customerId: c.id,
              dueDate,
              status: RenewalReminderStatus.PENDING,
            },
          });
          // Materialization on the read path now only runs for an empty day
          // (perf — audit PER-02), so a mid-day admin-created customer would
          // otherwise not appear on the milkman's route until the next cron.
          // Insert today's delivery directly when the customer has a route, so
          // "add customer → shows on today's route" keeps working.
          if (body.routeId && product) {
            await tx.delivery.upsert({
              where: {
                customerId_productId_scheduledFor: {
                  customerId: c.id,
                  productId: product.id,
                  scheduledFor: startDate,
                },
              },
              create: {
                customerId: c.id,
                subscriptionId: sub.id,
                productId: product.id,
                routeId: body.routeId,
                scheduledLitres: body.litresPerDay,
                ratePerLitre: rate,
                status: DeliveryStatus.PENDING,
                scheduledFor: startDate,
              },
              update: {},
            });
          }
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
      const exists = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
      if (!exists) return reply.status(404).send({ error: 'NotFound' });
      const updated = await prisma.$transaction(async (tx) => {
        const c = await tx.customer.update({ where: { id }, data: body });
        // ADM-08: keep the ACTIVE subscription's litresPerDay in sync with the
        // customer's edited daily quantity. The scheduler/materializer read the
        // SUBSCRIPTION's litres, so editing only the customer field changed the
        // display but not what actually got delivered/billed going forward.
        if (body.litresPerDay !== undefined) {
          await tx.subscription.updateMany({
            where: { customerId: id, status: SubscriptionStatus.ACTIVE },
            data: { litresPerDay: body.litresPerDay },
          });
        }
        // DAT-08: a route reassignment must take effect TODAY. Today's delivery
        // was already materialized with the OLD routeId (materialization snapshots
        // the route), so re-point any of today's still-PENDING deliveries to the
        // new route — otherwise the old route's milkman still sees the stop and
        // the new one doesn't. Future days re-materialize from the customer's
        // route, so only today's open rows need fixing.
        if (body.routeId !== undefined) {
          await tx.delivery.updateMany({
            where: {
              customerId: id,
              scheduledFor: startOfBusinessDayUTC(),
              status: DeliveryStatus.PENDING,
            },
            data: { routeId: body.routeId },
          });
        }
        return c;
      });
      return updated;
    },
  });

  app.delete('/:id', {
    preHandler: adminOnly,
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const existing = await prisma.customer.findUnique({ where: { id }, select: { id: true } });
      if (!existing) return reply.status(404).send({ error: 'NotFound' });
      // Soft-cancel must also STOP deliveries. Previously this only flipped
      // Customer.status; the scheduler reads subscription.status, so a
      // "deleted" customer with an ACTIVE subscription kept getting milk
      // scheduled and billed forever (audit ADM-02). Cancel their active/
      // paused subscriptions and void pending renewal reminders atomically.
      // (The scheduler also now excludes non-ACTIVE customers as a backstop.)
      await prisma.$transaction(async (tx) => {
        await tx.customer.update({ where: { id }, data: { status: CustomerStatus.CANCELLED } });
        await tx.subscription.updateMany({
          where: {
            customerId: id,
            status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAUSED] },
          },
          data: { status: SubscriptionStatus.CANCELLED },
        });
        await tx.renewalReminder.updateMany({
          where: { customerId: id, status: RenewalReminderStatus.PENDING },
          data: { status: RenewalReminderStatus.CANCELLED },
        });
      });
      return { ok: true };
    },
  });
}
