/**
 * Admin bot tester endpoints.
 *
 *   POST /whatsapp/test/send   — drive the conversation engine with a fake
 *                                inbound message, return the bot's outbound
 *                                actions (captured from the stub messaging
 *                                provider). Same engine as production.
 *   POST /whatsapp/test/reset  — wipe the in-memory conversation session
 *                                for a phone so the next message starts a
 *                                fresh flow (onboarding from scratch).
 *
 * These routes are admin-only and only useful when the messaging provider
 * is `stub` — with a real Meta config the bot's outbound goes straight to
 * the customer's phone, not to our capture sink.
 */

import type { App } from '../../types';
import { z } from 'zod';

import { engine } from '../../whatsapp/engine';
import { sessionStore } from '../../whatsapp/session-store';
import { startStubCapture } from '../../providers/messaging/stub';
import { getMessagingProvider } from '../../providers/messaging';
import { normalizePhone } from '../../utils/phone';
import type { InboundMessage, OutboundAction } from '../../whatsapp/types';

const SendBody = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('text'),
    from: z.string().min(8),
    text: z.string().min(1).max(2000),
  }),
  z.object({
    kind: z.literal('button'),
    from: z.string().min(8),
    payload: z.string().min(1).max(200),
    title: z.string().min(1).max(200),
  }),
  z.object({
    kind: z.literal('list'),
    from: z.string().min(8),
    rowId: z.string().min(1).max(200),
    title: z.string().min(1).max(200),
  }),
]);

const ResetBody = z.object({
  from: z.string().min(8),
});

export async function registerWhatsAppTestRoutes(app: App) {
  // Admin-only — this is a debug surface, not a customer entry point.
  app.addHook('onRequest', app.authenticate);
  app.addHook('onRequest', app.requireRole('ADMIN'));

  app.post('/send', {
    handler: async (req, reply) => {
      const body = SendBody.parse(req.body);

      // Block the tester when a real Meta provider is configured — the
      // engine's outbound would go to the customer's actual phone and
      // never reach our capture sink. The admin should use Meta's
      // sandbox dashboard for live testing instead.
      const providerName = getMessagingProvider().name;
      if (providerName !== 'stub') {
        return reply.status(409).send({
          error: 'NotApplicable',
          message: `Bot tester only works with the stub messaging provider (current: ${providerName}). Unset MESSAGING_PROVIDER / META_* envs to test.`,
        });
      }

      const from = normalizePhone(body.from);
      const timestamp = Date.now();
      const messageId = `test-${timestamp}`;

      let inbound: InboundMessage;
      if (body.kind === 'text') {
        inbound = { kind: 'text', from, text: body.text, messageId, timestamp };
      } else if (body.kind === 'button') {
        inbound = {
          kind: 'button',
          from,
          payload: body.payload,
          title: body.title,
          messageId,
          timestamp,
        };
      } else {
        inbound = {
          kind: 'list',
          from,
          rowId: body.rowId,
          title: body.title,
          messageId,
          timestamp,
        };
      }

      const outbound: OutboundAction[] = [];
      const dispose = startStubCapture((a) => outbound.push(a));
      try {
        await engine.process(inbound);
      } finally {
        dispose();
      }

      // Return the conversation state too — useful for the UI to show
      // which flow + step the bot is currently in.
      const state = await sessionStore.get(from);
      return {
        outbound,
        state: state
          ? { flow: state.flow, step: state.step, customerId: state.customerId ?? null }
          : null,
      };
    },
  });

  app.post('/reset', {
    handler: async (req) => {
      const body = ResetBody.parse(req.body);
      const from = normalizePhone(body.from);
      await sessionStore.clear(from);
      return { ok: true, from };
    },
  });
}
