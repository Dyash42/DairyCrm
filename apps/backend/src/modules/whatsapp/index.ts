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
import { verifyWebhook } from '../../whatsapp/webhook';
import { registerWhatsAppTestRoutes } from './test';

export async function registerWhatsAppRoutes(app: App) {
  // Admin bot-tester sub-router. Mounted under /test (so full path is
  // /whatsapp/test/send + /whatsapp/test/reset). This is the chat-style
  // playground for /whatsapp routes when running on the stub provider.
  await app.register(registerWhatsAppTestRoutes, { prefix: '/test' });


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
  // Capture the raw body BEFORE parsing — required so HMAC is computed
  // over the bytes Meta signed, not the re-serialized JSON.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    function (req, body, done) {
      (req as { rawBody?: string }).rawBody = body as string;
      try {
        const json = (body as string).length === 0 ? {} : JSON.parse(body as string);
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
      const rawBody = req.rawBody ?? '';
      const signature = req.headers['x-hub-signature-256'] as string | undefined;
      const provider = getMessagingProvider();
      if (!provider.verifyWebhookSignature(rawBody, signature)) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }
      const event = req.body as Parameters<
        typeof import('../../whatsapp/webhook').handleWebhook
      >[0];
      // Fire-and-forget the engine so we respond fast (Meta retries on >5s).
      void (async () => {
        try {
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
