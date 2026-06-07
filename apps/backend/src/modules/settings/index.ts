/**
 * Settings module.
 *
 * GET  /settings          — read all settings
 * PUT  /settings/rates    — update rate per litre per SKU
 * GET  /settings/holidays — list holiday calendar
 * POST /settings/holidays — add a holiday
 * DEL  /settings/holidays/:id — remove a holiday
 *
 * Rates are stored in a single-row Setting table keyed by SKU. Until the
 * SettingValue model is added (Phase 5+) this returns the constants
 * defaults so the admin UI shows something sensible. The PUT route is a
 * no-op stub awaiting that schema migration.
 */

import type { App } from '../../types';
import { z } from 'zod';

import { prisma } from '../../prisma';
import { DEFAULT_RATE_PER_LITRE_INR } from '../../constants';
import { notFound } from '../../utils/http';

const HolidayBody = z.object({
  date: z.coerce.date(),
  reason: z.string().min(1),
  scope: z.string().default('ALL'),
});

export async function registerSettingsRoutes(app: App) {
  app.addHook('onRequest', app.authenticate);

  app.get('/', async () => {
    return {
      rates: {
        COW_MILK: DEFAULT_RATE_PER_LITRE_INR,
        BUFFALO_MILK: 78,
        A2_MILK: 110,
      },
      skus: [
        { code: 'COW_MILK', name: 'Cow milk', active: true },
        { code: 'BUFFALO_MILK', name: 'Buffalo milk', active: true },
        { code: 'A2_MILK', name: 'A2 milk', active: false },
        { code: 'CURD_500', name: 'Curd 500g', active: true },
        { code: 'GHEE_200', name: 'Ghee 200ml', active: false },
      ],
      deliveryWindow: { morningStart: '05:30', morningEnd: '08:30' },
    };
  });

  app.get('/holidays', async () => {
    const rows = await prisma.holidayCalendar.findMany({ orderBy: { date: 'asc' } });
    return { holidays: rows };
  });

  app.post('/holidays', {
    handler: async (req, reply) => {
      const body = HolidayBody.parse(req.body);
      const row = await prisma.holidayCalendar.upsert({
        where: { date: body.date },
        create: body,
        update: { reason: body.reason, scope: body.scope },
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

  app.put('/rates', {
    handler: async (req) => {
      // TODO: persist to SettingValue table once added. For now: read back
      // what was sent so the UI's "Saved" state is honest.
      const body = req.body as Record<string, number>;
      return { ok: true, rates: body };
    },
  });
}
