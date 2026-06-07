/**
 * WhatsApp webhook Fastify module.
 *
 * GET  /whatsapp/webhook   — Meta verification handshake
 * POST /whatsapp/webhook   — incoming messages + status callbacks
 *
 * POST requests are HMAC-verified against META_APP_SECRET. We compute
 * the HMAC of the raw JSON body and compare against the `X-Hub-Signature-256`
 * header. Mismatches → 401 with no body, no logs that leak the payload.
 */

import type { App } from '../../types';

import { getMessagingProvider } from '../../providers/messaging';
import { engine } from '../../whatsapp/engine';
import { verifyWebhook } from '../../whatsapp/webhook';

export async function registerWhatsAppRoutes(app: App) {
  // GET — Meta verification challenge
  app.route({
    method: 'GET',
    url: '/webhook',
    handler: async (req, reply) => {
      const q = req.query as Record<string, string | undefined>;
      const result = verifyWebhook({
        mode: q['hub.mode'],
        token: q['hub.verify_token'],
        challenge: q['hub.challenge'],
      });
      return reply.status(result.status).type('text/plain').send(result.body);
    },
  });

  // POST — incoming messages (HMAC-verified)
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    function (_req, body, done) {
      try {
        const json = JSON.parse(body as string);
        done(null, json);
      } catch (err) {
        done(err as Error, undefined);
      }
    },
  );

  app.route({
    method: 'POST',
    url: '/webhook',
    config: { rateLimit: { max: 200, timeWindow: '1 minute' } },
    handler: async (req, reply) => {
      const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const signature = req.headers['x-hub-signature-256'] as string | undefined;
      if (!getMessagingProvider().verifyWebhookSignature(rawBody, signature)) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const event = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body) as Parameters<
        typeof import('../../whatsapp/webhook').handleWebhook
      >[0];
      // Fire-and-forget the engine so we respond fast (Meta retries on >5s).
      void (async () => {
        try {
          await engine.process; // reference to keep import live
          const { handleWebhook } = await import('../../whatsapp/webhook');
          await handleWebhook(event);
        } catch (err) {
          req.log.error({ err }, 'whatsapp engine error');
        }
      })();
      return reply.status(200).send({ ok: true });
    },
  });

}
