/**
 * Bot prompts — editable session-window strings the bot speaks.
 *
 * These are NOT Meta-approved templates (those live in ./templates.ts and
 * must be edited in WhatsApp Manager). The prompts here are inline
 * session-window messages an admin can edit live via /bot-prompts; the
 * cache is warmed at boot and invalidated on update.
 *
 * Usage from a flow:
 *   import { getPrompt } from '../prompts';
 *   const p = getPrompt('onboarding.ask_address', { firstName });
 *   ctx.send({ kind: 'text', to: phone, body: p.body });
 *
 * For interactive prompts the rendered shape mirrors OutboundAction:
 *   const p = getPrompt('pause.confirm.body', { start, date, days });
 *   ctx.send({ kind: 'buttons', to: phone, body: p.body, buttons: p.buttons! });
 */

import { prisma } from '../prisma';

export type PromptKind = 'text' | 'buttons' | 'list';

export interface PromptButton {
  id: string;
  title: string;
}
export interface PromptRow {
  id: string;
  title: string;
  description?: string;
}

export interface PromptDef {
  key: string;
  flow: string;
  label: string;
  kind: PromptKind;
  body: string;
  buttons?: PromptButton[];
  rows?: PromptRow[];
  variables: string[];
  sortOrder: number;
  notes?: string;
  updatedAt: Date;
  updatedBy?: string;
}

export interface RenderedPrompt {
  kind: PromptKind;
  body: string;
  buttons?: PromptButton[];
  rows?: PromptRow[];
}

const cache = new Map<string, PromptDef>();
let warmed = false;

/**
 * In-code default copy for every session-window prompt the flows use.
 *
 * These are the safety net: the DB `BotPrompt` table (warmed into `cache`)
 * OVERRIDES these when present, but if the table is empty/unseeded — or the
 * cache hasn't warmed yet — getPrompt falls back here instead of throwing.
 * Previously an unseeded table made getPrompt throw, the webhook swallowed
 * the error, and the customer got silence (a dead bot). Keep the keys here
 * in sync with the flows; the admin-editable DB rows are the source of truth
 * for the live copy.
 */
const DEFAULT_PROMPTS: Record<
  string,
  { kind: PromptKind; body: string; buttons?: PromptButton[]; rows?: PromptRow[] }
> = {
  // ---- onboarding ----
  'onboarding.ask_address': { kind: 'text', body: 'Thanks ${firstName}! What is your delivery address?' },
  'onboarding.ask_email': { kind: 'text', body: 'Got it. What is your email? (or type "skip")' },
  'onboarding.ask_alt_phone': { kind: 'text', body: 'An alternate phone number? (or type "skip")' },
  'onboarding.ask_litres': { kind: 'text', body: 'How many litres of milk would you like per day? e.g. 1 or 1.5' },
  'onboarding.ask_litres.retry': { kind: 'text', body: 'Please enter the litres as a number, e.g. 1 or 1.5.' },
  'onboarding.creating_account': { kind: 'text', body: 'Creating your account…' },
  'onboarding.qr_caption': { kind: 'text', body: 'This is your Jharanai QR (${customerCode}). The delivery partner scans it at your door.' },
  'onboarding.ask_days': { kind: 'text', body: 'For how many days would you like to subscribe? e.g. 30' },
  'onboarding.ask_days.retry': { kind: 'text', body: 'Please enter the number of days, e.g. 30.' },
  // ---- payment (shared) ----
  'payment.not_received': {
    kind: 'text',
    body: 'We have not received your payment yet. Please complete it using the link above, then reply here and we will activate your subscription.',
  },
  // ---- pause ----
  'pause.ask_start': { kind: 'text', body: 'Sure — from which date should we pause? (e.g. 2026-06-20)' },
  'pause.ask_start.retry_invalid_date': { kind: 'text', body: 'I could not read that date. Try YYYY-MM-DD, e.g. 2026-06-20.' },
  'pause.ask_start.retry_past': { kind: 'text', body: 'Please choose a start date that is today or later.' },
  'pause.ask_end': { kind: 'text', body: 'Until which date? (e.g. 2026-06-25)' },
  'pause.ask_end.retry_invalid_date': { kind: 'text', body: 'I could not read that date. Try YYYY-MM-DD, e.g. 2026-06-25.' },
  'pause.ask_end.retry_before_start': { kind: 'text', body: 'The end date must be on or after the start date. Please re-enter the end date.' },
  'pause.confirm.body': {
    kind: 'buttons',
    body: 'Pause deliveries from ${start} to ${date} (${days} days)?',
    buttons: [
      { id: 'pause_confirm', title: 'Confirm pause' },
      { id: 'pause_cancel', title: 'Cancel' },
    ],
  },
  'pause.confirm.cancelled': { kind: 'text', body: 'No problem — your deliveries continue as usual.' },
  // ---- menu ----
  'menu.returning.welcome': {
    kind: 'list',
    body: 'Welcome back, ${customerName}! What would you like to do?',
    rows: [
      { id: 'renew', title: 'Renew subscription' },
      { id: 'pause', title: 'Pause deliveries' },
      { id: 'resume', title: 'Resume deliveries' },
      { id: 'support', title: 'Support' },
    ],
  },
  'menu.returning.button_text': { kind: 'text', body: 'Choose an option' },
  'menu.returning.section_title.manage': { kind: 'text', body: 'Manage subscription' },
  // ---- resume ----
  'resume.ask_choice.body': {
    kind: 'buttons',
    body: 'Your pause runs until ${endLabel}. Resume deliveries from tomorrow?',
    buttons: [
      { id: 'resume_tomorrow', title: 'Resume tomorrow' },
      { id: 'decline', title: 'Keep paused' },
    ],
  },
  'resume.decline.body': { kind: 'text', body: 'No problem — your deliveries stay paused.' },
  // ---- support ----
  'support.ask_kind.body': {
    kind: 'buttons',
    body: 'How can we help?',
    buttons: [
      { id: 'missed', title: 'Missed delivery' },
      { id: 'other', title: 'Something else' },
    ],
  },
  'support.await_kind.handoff': { kind: 'text', body: 'Thanks — our team will reach out to help you shortly.' },
  'support.missed.logged': {
    kind: 'text',
    body: 'Thanks — we have logged your missed-delivery report for ${date}. Our team will verify and apply any credit to your account.',
  },
  // ---- location (door pin for navigation) ----
  'location.request': {
    kind: 'text',
    body: '📍 One last thing so our delivery partner finds your exact door. If you are at home right now, tap 📎 → Location and send it. Not home? Set your home on the map anytime (works from anywhere): ${pin_url}',
  },
  'location.saved': {
    kind: 'text',
    body: '📍 Got it — your home location is saved. Thank you!',
  },
};

function rowToDef(r: {
  key: string;
  flow: string;
  label: string;
  kind: string;
  body: string;
  buttons: unknown;
  rows: unknown;
  variables: unknown;
  sortOrder: number;
  notes: string | null;
  updatedAt: Date;
  updatedBy: string | null;
}): PromptDef {
  return {
    key: r.key,
    flow: r.flow,
    label: r.label,
    kind: r.kind as PromptKind,
    body: r.body,
    buttons: (r.buttons as PromptButton[] | null) ?? undefined,
    rows: (r.rows as PromptRow[] | null) ?? undefined,
    variables: (r.variables as string[] | null) ?? [],
    sortOrder: r.sortOrder,
    notes: r.notes ?? undefined,
    updatedAt: r.updatedAt,
    updatedBy: r.updatedBy ?? undefined,
  };
}

/** Warm the in-memory cache from the DB. Call at server boot. */
export async function warmBotPrompts(): Promise<void> {
  const rows = await prisma.botPrompt.findMany({
    orderBy: [{ flow: 'asc' }, { sortOrder: 'asc' }],
  });
  cache.clear();
  for (const r of rows) cache.set(r.key, rowToDef(r));
  warmed = true;
}

/**
 * Get a rendered prompt by key. Substitutes ${var} placeholders in the
 * body and in every button/row title. Unknown variables stay as
 * literal ${name} so an editor missing a token is loud, not silent.
 *
 * Resolution order: the warmed DB cache (admin-editable, source of truth)
 * first, then the in-code DEFAULT_PROMPTS safety net. Only a key that
 * exists in neither throws — that's a genuine code bug, not a content gap.
 */
export function getPrompt(
  key: string,
  vars: Record<string, string | number | undefined> = {},
): RenderedPrompt {
  const def = (warmed ? cache.get(key) : undefined) ?? DEFAULT_PROMPTS[key];
  if (!def) throw new Error(`Bot prompt not found: ${key}`);
  return {
    kind: def.kind,
    body: interpolate(def.body, vars),
    buttons: def.buttons?.map((b) => ({ id: b.id, title: interpolate(b.title, vars) })),
    rows: def.rows?.map((r) => ({
      id: r.id,
      title: interpolate(r.title, vars),
      description: r.description ? interpolate(r.description, vars) : undefined,
    })),
  };
}

function interpolate(s: string, vars: Record<string, string | number | undefined>): string {
  return s.replace(/\$\{(\w+)\}/g, (_, k: string) => {
    const v = vars[k];
    return v === undefined || v === null ? `\${${k}}` : String(v);
  });
}

/** Admin: list all prompts, grouped naturally by flow. */
export function listBotPromptsFromCache(): PromptDef[] {
  return Array.from(cache.values()).sort((a, b) => {
    if (a.flow !== b.flow) return a.flow.localeCompare(b.flow);
    return a.sortOrder - b.sortOrder;
  });
}

/**
 * Admin: update a prompt's editable fields (body, button/row titles,
 * notes). The button/row `id`s are LOCKED — the engine matches them in
 * subsequent steps and renaming them would break the flow. We strip
 * incoming ids and re-attach them from the stored definition.
 */
export async function updateBotPromptByKey(
  key: string,
  patch: {
    body?: string;
    buttons?: Array<{ id: string; title: string }>;
    rows?: Array<{ id: string; title: string; description?: string }>;
    notes?: string | null;
    updatedBy?: string;
  },
): Promise<PromptDef> {
  const existing = cache.get(key);
  if (!existing) throw new Error(`Bot prompt not found: ${key}`);

  // Preserve locked ids: incoming buttons[] / rows[] must match the
  // existing id set exactly. Otherwise refuse the patch — silently
  // re-ordering or dropping a button is the kind of thing that breaks
  // a button-id payload match in the next handler step.
  const data: Record<string, unknown> = {};
  if (patch.body !== undefined) data.body = patch.body;
  if (patch.notes !== undefined) data.notes = patch.notes;
  if (patch.updatedBy !== undefined) data.updatedBy = patch.updatedBy;
  if (patch.buttons !== undefined) {
    if (!existing.buttons) throw new Error(`Prompt ${key} has no buttons to edit`);
    data.buttons = mergeLocked(existing.buttons, patch.buttons, 'title');
  }
  if (patch.rows !== undefined) {
    if (!existing.rows) throw new Error(`Prompt ${key} has no rows to edit`);
    data.rows = mergeLocked(existing.rows, patch.rows, 'title', 'description');
  }

  const updated = await prisma.botPrompt.update({ where: { key }, data });
  const def = rowToDef(updated);
  cache.set(key, def);
  return def;
}

/**
 * Apply `incoming` over `existing` keyed by `id`, only copying the
 * editable fields. Refuses if the incoming id set differs from existing.
 */
function mergeLocked<T extends { id: string }>(
  existing: T[],
  incoming: Array<Partial<T> & { id: string }>,
  ...editableFields: Array<keyof T>
): T[] {
  if (existing.length !== incoming.length) {
    throw new Error(
      `Locked-id mismatch: expected ${existing.length} entries, got ${incoming.length}`,
    );
  }
  const incomingById = new Map(incoming.map((x) => [x.id, x]));
  return existing.map((e) => {
    const inc = incomingById.get(e.id);
    if (!inc) throw new Error(`Locked-id mismatch: missing id "${e.id}"`);
    const merged: T = { ...e };
    for (const f of editableFields) {
      if (f in inc && inc[f] !== undefined) {
        (merged[f] as unknown) = inc[f];
      }
    }
    return merged;
  });
}
