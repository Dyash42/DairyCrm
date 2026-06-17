/**
 * Bot prompts module — admin-editable session-window strings.
 *
 *   GET   /bot-prompts          — all prompts grouped by flow
 *   GET   /bot-prompts/:key     — one prompt
 *   PATCH /bot-prompts/:key     — update body / button titles / row titles / notes
 *
 * The button/row `id` fields are LOCKED at the storage layer
 * (see updateBotPromptByKey) because the engine matches them in the
 * next handler step. Only the user-visible title text is editable.
 */

import type { App } from '../../types';
import { z } from 'zod';

import {
  listBotPromptsFromCache,
  updateBotPromptByKey,
  type PromptDef,
} from '../../whatsapp/prompts';
import { notFound } from '../../utils/http';

const ButtonPatch = z.object({
  id: z.string(),
  title: z.string().min(1).max(20),
});

const RowPatch = z.object({
  id: z.string(),
  title: z.string().min(1).max(24),
  description: z.string().max(72).optional(),
});

const UpdateBody = z.object({
  body: z.string().min(1).max(1024).optional(),
  buttons: z.array(ButtonPatch).max(3).optional(),
  rows: z.array(RowPatch).max(10).optional(),
  notes: z.string().max(500).nullable().optional(),
});

export async function registerBotPromptRoutes(app: App) {
  app.addHook('onRequest', app.authenticate);
  app.addHook('onRequest', app.requireRole('ADMIN'));

  app.get('/', async () => {
    const all = listBotPromptsFromCache();
    return { prompts: all.map(serialize) };
  });

  app.get('/:key', async (req, reply) => {
    const { key } = req.params as { key: string };
    const all = listBotPromptsFromCache();
    const p = all.find((x) => x.key === key);
    if (!p) return notFound(reply, 'Bot prompt not found');
    return serialize(p);
  });

  app.patch('/:key', {
    handler: async (req, reply) => {
      const { key } = req.params as { key: string };
      const patch = UpdateBody.parse(req.body);
      const userId = (req.user as { sub?: string } | undefined)?.sub;
      try {
        const updated = await updateBotPromptByKey(key, {
          ...patch,
          updatedBy: userId,
        });
        return serialize(updated);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.startsWith('Bot prompt not found')) {
          return notFound(reply, msg);
        }
        return reply.status(422).send({ error: 'ValidationError', message: msg });
      }
    },
  });
}

function serialize(p: PromptDef) {
  return {
    key: p.key,
    flow: p.flow,
    label: p.label,
    kind: p.kind,
    body: p.body,
    buttons: p.buttons ?? null,
    rows: p.rows ?? null,
    variables: p.variables,
    sortOrder: p.sortOrder,
    notes: p.notes ?? null,
    updatedAt: p.updatedAt.toISOString(),
    updatedBy: p.updatedBy ?? null,
  };
}
