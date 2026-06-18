/**
 * Settings module.
 *
 *   GET    /settings                — all settings grouped, with current
 *                                     value + isDefault flag
 *   PUT    /settings/:key           — update a single setting (admin only)
 *   GET    /settings/holidays       — list holiday calendar
 *   POST   /settings/holidays       — add a holiday
 *   DELETE /settings/holidays/:id   — remove a holiday
 *
 * Settings live in the `Setting` table; defaults are defined in
 * SETTING_DEFINITIONS. The admin UI reads /settings to render labels +
 * current values; PUTs the new value with the same key.
 */

import type { App } from '../../types';
import { z } from 'zod';

import { prisma } from '../../prisma';
import { settings, SETTING_DEFINITIONS } from '../../services/settings';
import { notFound } from '../../utils/http';

const HolidayBody = z.object({
  date: z.coerce.date(),
  reason: z.string().min(1),
  scope: z.string().default('ALL'),
});

const SettingUpdateBody = z.object({
  value: z.unknown(),
});

export async function registerSettingsRoutes(app: App) {
  // Admin-only — settings change billing rates, OTP length, pause caps,
  // support phone, and other business knobs. Without this guard any
  // EXECUTIVE could weaken security or redirect customers.
  app.addHook('onRequest', app.authenticate);
  app.addHook('onRequest', app.requireRole('ADMIN'));

  app.get('/', async () => {
    const grouped = await settings.listAllGrouped();
    return { groups: grouped };
  });

  // Allowlist lookup — building it once at module load is cheap.
  const definitionByKey = new Map(SETTING_DEFINITIONS.map((d) => [d.key, d]));

  app.put('/:key', {
    handler: async (req, reply) => {
      const { key } = req.params as { key: string };
      const { value } = SettingUpdateBody.parse(req.body);
      // Allowlist: refuse keys not in SETTING_DEFINITIONS. Without this
      // an attacker (or buggy admin UI) could write garbage rows to the
      // Setting table, or override defaults that were never meant to be
      // user-tunable.
      const def = definitionByKey.get(key);
      if (!def) {
        return reply.status(404).send({
          error: 'UnknownSetting',
          message: `Setting key '${key}' is not defined.`,
        });
      }
      if (def.editable === false) {
        return reply.status(422).send({
          error: 'ReadOnlySetting',
          message: `Setting '${key}' is managed by env / not editable from the admin UI.`,
        });
      }
      // WEB-02/13: validate the value against the definition's type before
      // persisting. The admin UI sends `Number(rawInput)`, so an empty/garbage
      // field would otherwise store NaN (or a negative duration / pause cap)
      // straight into business math. Reject it here too — server-side is the
      // real boundary; the client check is just nicer UX.
      let finalValue: unknown = value;
      if (def.type === 'NUMBER') {
        const n = typeof value === 'number' ? value : Number(value);
        if (!Number.isFinite(n) || n < 0) {
          return reply.status(422).send({
            error: 'InvalidValue',
            message: `'${key}' must be a number ≥ 0.`,
          });
        }
        finalValue = n;
      } else if (def.type === 'BOOLEAN') {
        finalValue = value === true || value === 'true';
      } else if (def.type === 'STRING' && typeof value !== 'string') {
        finalValue = String(value);
      }
      const me = req.user;
      await settings.set(key, finalValue, me.sub);
      return reply.status(200).send({ ok: true, key, value: finalValue });
    },
  });

  app.get('/holidays', async () => {
    const rows = await prisma.holidayCalendar.findMany({ orderBy: { date: 'asc' } });
    return { holidays: rows };
  });

  app.post('/holidays', {
    handler: async (req, reply) => {
      const body = HolidayBody.parse(req.body);
      // Composite key (date, scope) lets ALL-scope and route-scoped
      // holidays coexist on the same calendar date.
      const row = await prisma.holidayCalendar.upsert({
        where: { date_scope: { date: body.date, scope: body.scope ?? 'ALL' } },
        create: body,
        update: { reason: body.reason },
      });
      return reply.status(201).send(row);
    },
  });

  app.delete('/holidays/:id', {
    handler: async (req, reply) => {
      const { id } = req.params as { id: string };
      const deleted = await prisma.holidayCalendar.delete({ where: { id } }).catch(() => null);
      if (!deleted) return notFound(reply, 'Holiday');
      return { ok: true };
    },
  });

  /**
   * GET /settings/audit
   *
   * Merges two audit-shaped data sources into one unified feed for admins:
   *   - QrCode rows in REVOKED status: who revoked, when, why
   *   - Recent Delivery rows: scanned vs missed; supports drilling into
   *     who delivered what
   *
   * Pagination is by limit (max 200) per stream. The merge is server-side
   * so the UI is one simple list to render.
   */
  app.get('/audit', {
    handler: async (req) => {
      const { limit: limitRaw } = (req.query as { limit?: string }) ?? {};
      const limit = limitRaw ? Math.min(200, Math.max(1, Number(limitRaw))) : 50;

      const [revokedQrs, recentDeliveries] = await Promise.all([
        prisma.qrCode.findMany({
          where: { status: 'REVOKED' },
          orderBy: { revokedAt: 'desc' },
          take: limit,
          include: {
            customer: { select: { id: true, name: true, code: true } },
          },
        }),
        prisma.delivery.findMany({
          orderBy: { createdAt: 'desc' },
          take: limit,
          include: {
            customer: { select: { id: true, name: true, code: true } },
            executive: { include: { user: { select: { name: true } } } },
          },
        }),
      ]);

      const events: Array<{
        ts: string;
        kind: 'QR_REVOKED' | 'DELIVERY_SCANNED' | 'DELIVERY_MISSED';
        customer: { id: string; name: string; code: string };
        actor: string | null;
        detail: string;
      }> = [];

      // QR rows store the revoker as a raw User.id. Look up names in a
      // single batch so the audit table shows "Sunil Pradhan" instead of
      // "clxxxxxxxxxxxxx". Falls back to the UUID if the user has been
      // deleted since.
      const revokerIds = Array.from(
        new Set(revokedQrs.map((q) => q.revokedBy).filter((s): s is string => !!s)),
      );
      const revokerUsers = revokerIds.length
        ? await prisma.user.findMany({
            where: { id: { in: revokerIds } },
            select: { id: true, name: true },
          })
        : [];
      const revokerNameById = new Map(revokerUsers.map((u) => [u.id, u.name]));

      for (const q of revokedQrs) {
        const actor = q.revokedBy ? revokerNameById.get(q.revokedBy) ?? q.revokedBy : null;
        events.push({
          ts: (q.revokedAt ?? q.generatedAt).toISOString(),
          kind: 'QR_REVOKED',
          customer: q.customer,
          actor,
          detail: `QR v${q.version} revoked — ${q.reason ?? 'no reason given'}`,
        });
      }
      for (const d of recentDeliveries) {
        const wasDelivered = d.status === 'DELIVERED' || d.status === 'PARTIAL';
        events.push({
          ts: d.createdAt.toISOString(),
          kind: wasDelivered ? 'DELIVERY_SCANNED' : 'DELIVERY_MISSED',
          customer: d.customer,
          actor: d.executive?.user.name ?? null,
          detail: wasDelivered
            ? `Delivered ${Number(d.deliveredLitres ?? d.scheduledLitres).toFixed(1)}L`
            : `${d.status}: ${d.note ?? 'no note'}`,
        });
      }

      events.sort((a, b) => b.ts.localeCompare(a.ts));
      return { events: events.slice(0, limit) };
    },
  });
}
