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
import { settings } from '../../services/settings';
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
  app.addHook('onRequest', app.authenticate);

  app.get('/', async () => {
    const grouped = await settings.listAllGrouped();
    return { groups: grouped };
  });

  app.put('/:key', {
    handler: async (req, reply) => {
      const { key } = req.params as { key: string };
      const { value } = SettingUpdateBody.parse(req.body);
      const me = req.user;
      await settings.set(key, value, me.sub);
      return reply.status(200).send({ ok: true, key, value });
    },
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
}
