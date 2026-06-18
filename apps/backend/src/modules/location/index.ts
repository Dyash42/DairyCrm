/**
 * Public location-pin endpoints — the customer opens /pin/<token> on the web
 * (self-hosted) and drops their home pin. Both routes are UNauthenticated by
 * design: the unguessable, expiring, single-use token IS the credential.
 *
 *   GET  /location/:token   — fetch what the page needs (name, address, current pin)
 *   POST /location/:token   — save lat/lng, then consume the token
 */

import { z } from 'zod';

import type { App } from '../../types';
import { prisma } from '../../prisma';

const SaveBody = z.object({
  lat: z.coerce.number().min(-90).max(90),
  lng: z.coerce.number().min(-180).max(180),
});

export async function registerLocationRoutes(app: App) {
  // GET — load the page context. Viewable until expiry (even after a save, so
  // the customer can see the pin they set); saving again is blocked below.
  app.get('/:token', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    handler: async (req, reply) => {
      const { token } = req.params as { token: string };
      const row = await prisma.locationToken.findUnique({
        where: { token },
        include: {
          customer: {
            select: { name: true, area: true, addressLine1: true, lat: true, lng: true },
          },
        },
      });
      if (!row) return reply.status(404).send({ error: 'NotFound' });
      if (row.expiresAt < new Date()) return reply.status(410).send({ error: 'Expired' });
      return {
        customerName: row.customer.name,
        area: row.customer.area,
        address: row.customer.addressLine1,
        lat: row.customer.lat,
        lng: row.customer.lng,
        used: row.usedAt != null,
      };
    },
  });

  // POST — save the pin and consume the token (single-use).
  app.post('/:token', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
    handler: async (req, reply) => {
      const { token } = req.params as { token: string };
      const body = SaveBody.parse(req.body);
      const row = await prisma.locationToken.findUnique({ where: { token } });
      if (!row) return reply.status(404).send({ error: 'NotFound' });
      if (row.expiresAt < new Date()) return reply.status(410).send({ error: 'Expired' });
      if (row.usedAt) return reply.status(409).send({ error: 'AlreadyUsed' });

      // Compare-and-swap the consume so concurrent POSTs can't both claim the
      // token: only the writer that flips usedAt from NULL wins. The early
      // read above is just a fast-path 409 — this updateMany is the authority.
      const claimed = await prisma.$transaction(async (tx) => {
        const claim = await tx.locationToken.updateMany({
          where: { token, usedAt: null },
          data: { usedAt: new Date() },
        });
        if (claim.count === 0) return false;
        await tx.customer.update({
          where: { id: row.customerId },
          data: { lat: body.lat, lng: body.lng, geoUpdatedAt: new Date() },
        });
        return true;
      });
      if (!claimed) return reply.status(409).send({ error: 'AlreadyUsed' });
      return { ok: true };
    },
  });
}
