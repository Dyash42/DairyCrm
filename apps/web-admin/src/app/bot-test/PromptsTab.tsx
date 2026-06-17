'use client';

/**
 * Bot prompts editor — non-Meta session-window strings.
 *
 * Lists all prompts grouped by flow, with edit-in-place for body + button
 * titles + row titles + notes. Button/row IDs are LOCKED (the engine
 * matches them in the next handler step); the UI shows the ID as a
 * pill next to the editable title input.
 *
 * Variable placeholders (${firstName}, ${customerName}, etc.) are shown
 * as helper chips above each body field. Editing the chip text is a no-op
 * — the chip just documents what's available; the live variable substitution
 * happens in the backend's prompts.ts.
 */

import { useEffect, useMemo, useState } from 'react';
import { Save, RotateCcw, Loader2, Check, AlertCircle } from 'lucide-react';

import { Card, CardBody } from '@/components/ui/Card';
import {
  fetchBotPrompts,
  updateBotPrompt,
  type BotPromptRecord,
  type BotPromptButton,
  type BotPromptRow,
  ApiError,
} from '@/lib/api';

const FLOW_TITLES: Record<string, string> = {
  onboarding: 'Onboarding',
  menu: 'Menu',
  pause: 'Pause',
  resume: 'Resume',
  support: 'Support',
};

interface DraftState {
  body: string;
  buttons: BotPromptButton[];
  rows: BotPromptRow[];
}

function draftFrom(p: BotPromptRecord): DraftState {
  return {
    body: p.body,
    buttons: (p.buttons ?? []).map((b) => ({ ...b })),
    rows: (p.rows ?? []).map((r) => ({ ...r })),
  };
}

function isDirty(p: BotPromptRecord, d: DraftState): boolean {
  if (p.body !== d.body) return true;
  if (p.buttons && p.buttons.some((b, i) => b.title !== d.buttons[i]?.title)) return true;
  if (p.rows && p.rows.some((r, i) => r.title !== d.rows[i]?.title || (r.description ?? '') !== (d.rows[i]?.description ?? ''))) return true;
  return false;
}

export function PromptsTab() {
  const [prompts, setPrompts] = useState<BotPromptRecord[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [errorByKey, setErrorByKey] = useState<Record<string, string>>({});
  const [savedAt, setSavedAt] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    fetchBotPrompts()
      .then((res) => {
        if (cancelled) return;
        setPrompts(res.prompts);
        const d: Record<string, DraftState> = {};
        for (const p of res.prompts) d[p.key] = draftFrom(p);
        setDrafts(d);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(err instanceof ApiError ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const grouped = useMemo(() => {
    if (!prompts) return null;
    const out: Record<string, BotPromptRecord[]> = {};
    for (const p of prompts) {
      out[p.flow] = out[p.flow] ?? [];
      out[p.flow]!.push(p);
    }
    return out;
  }, [prompts]);

  function updateDraft(key: string, patch: Partial<DraftState>) {
    setDrafts((d) => ({ ...d, [key]: { ...d[key]!, ...patch } }));
  }

  function resetDraft(p: BotPromptRecord) {
    setDrafts((d) => ({ ...d, [p.key]: draftFrom(p) }));
    setErrorByKey((e) => ({ ...e, [p.key]: '' }));
  }

  async function save(p: BotPromptRecord) {
    const d = drafts[p.key];
    if (!d || !isDirty(p, d)) return;
    setSavingKey(p.key);
    setErrorByKey((e) => ({ ...e, [p.key]: '' }));
    try {
      const patch: Parameters<typeof updateBotPrompt>[1] = {};
      if (p.body !== d.body) patch.body = d.body;
      if (p.buttons) patch.buttons = d.buttons;
      if (p.rows) patch.rows = d.rows;
      const updated = await updateBotPrompt(p.key, patch);
      setPrompts((list) =>
        list ? list.map((x) => (x.key === p.key ? updated : x)) : list,
      );
      setDrafts((all) => ({ ...all, [p.key]: draftFrom(updated) }));
      setSavedAt((s) => ({ ...s, [p.key]: Date.now() }));
    } catch (err) {
      setErrorByKey((e) => ({
        ...e,
        [p.key]: err instanceof ApiError ? err.message : String(err),
      }));
    } finally {
      setSavingKey(null);
    }
  }

  if (loadError) {
    return (
      <div className="bg-danger-light text-danger-dark rounded-lg p-4 max-w-3xl">
        <div className="font-semibold">Could not load prompts</div>
        <div className="text-sm mt-1">{loadError}</div>
      </div>
    );
  }

  if (!prompts || !grouped) {
    return (
      <div className="flex items-center gap-2 text-text-secondary py-8">
        <Loader2 size={16} className="animate-spin" />
        Loading prompts…
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="bg-info-light text-info-dark rounded-lg p-4 text-sm">
        <div className="font-semibold mb-1">Editing bot copy</div>
        <p className="leading-relaxed">
          These are the bot&apos;s mid-conversation replies — fully editable
          (no Meta approval). Edits go live immediately on the next message.
          Pre-approved Meta templates (renewal reminder, delivery
          confirmation, payment link, etc.) live in code and are NOT shown
          here — those need a code deploy + Meta re-approval.
        </p>
      </div>

      {Object.entries(grouped).map(([flow, items]) => (
        <section key={flow}>
          <div className="flex items-baseline gap-2 mb-3">
            <h2 className="text-lg font-semibold text-text-primary">
              {FLOW_TITLES[flow] ?? flow}
            </h2>
            <span className="text-xs text-text-muted">
              {items.length} prompt{items.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="space-y-3">
            {items.map((p) => {
              const d = drafts[p.key];
              if (!d) return null;
              const dirty = isDirty(p, d);
              const saving = savingKey === p.key;
              const err = errorByKey[p.key];
              const savedRecently = savedAt[p.key] && Date.now() - savedAt[p.key]! < 4000;
              return (
                <Card key={p.key}>
                  <div className="px-5 pt-4 pb-2 border-b border-border">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <div className="font-semibold text-sm text-text-primary">
                        {p.label}
                      </div>
                      <code className="text-xs text-text-muted bg-surface-muted px-2 py-0.5 rounded">
                        {p.key}
                      </code>
                    </div>
                    {p.notes && (
                      <div className="text-xs text-text-secondary mt-1.5 leading-relaxed">
                        {p.notes}
                      </div>
                    )}
                  </div>
                  <CardBody className="space-y-3">
                    {p.variables.length > 0 && (
                      <div className="flex items-center gap-1.5 flex-wrap text-xs">
                        <span className="text-text-muted">Variables available:</span>
                        {p.variables.map((v) => (
                          <code
                            key={v}
                            className="bg-surface-muted text-text-secondary px-1.5 py-0.5 rounded"
                          >
                            {'${' + v + '}'}
                          </code>
                        ))}
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-text-secondary mb-1">
                        Body
                      </label>
                      <textarea
                        value={d.body}
                        onChange={(e) => updateDraft(p.key, { body: e.target.value })}
                        rows={Math.min(6, Math.max(2, d.body.split('\n').length + 1))}
                        className="input w-full font-mono text-sm"
                        disabled={saving}
                      />
                    </div>

                    {p.buttons && d.buttons.length > 0 && (
                      <div>
                        <label className="block text-xs font-semibold text-text-secondary mb-1">
                          Buttons{' '}
                          <span className="font-normal text-text-muted">
                            (IDs locked, titles editable)
                          </span>
                        </label>
                        <div className="space-y-2">
                          {d.buttons.map((b, i) => (
                            <div key={b.id} className="flex items-center gap-2">
                              <code className="text-xs bg-surface-muted px-2 py-1 rounded text-text-muted shrink-0 w-32 truncate">
                                {b.id}
                              </code>
                              <input
                                type="text"
                                value={b.title}
                                onChange={(e) => {
                                  const next = [...d.buttons];
                                  next[i] = { ...b, title: e.target.value };
                                  updateDraft(p.key, { buttons: next });
                                }}
                                maxLength={20}
                                className="input flex-1"
                                disabled={saving}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {p.rows && d.rows.length > 0 && (
                      <div>
                        <label className="block text-xs font-semibold text-text-secondary mb-1">
                          List rows{' '}
                          <span className="font-normal text-text-muted">
                            (IDs locked, titles editable)
                          </span>
                        </label>
                        <div className="space-y-2">
                          {d.rows.map((r, i) => (
                            <div key={r.id} className="flex items-center gap-2">
                              <code className="text-xs bg-surface-muted px-2 py-1 rounded text-text-muted shrink-0 w-32 truncate">
                                {r.id}
                              </code>
                              <input
                                type="text"
                                value={r.title}
                                onChange={(e) => {
                                  const next = [...d.rows];
                                  next[i] = { ...r, title: e.target.value };
                                  updateDraft(p.key, { rows: next });
                                }}
                                maxLength={24}
                                className="input flex-1"
                                disabled={saving}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {err && (
                      <div className="bg-danger-light text-danger-dark rounded-md p-2 text-xs flex items-start gap-2">
                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                        <span>{err}</span>
                      </div>
                    )}

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        onClick={() => save(p)}
                        disabled={!dirty || saving}
                        className="btn-primary text-sm disabled:opacity-50"
                      >
                        {saving ? (
                          <Loader2 size={14} className="animate-spin" />
                        ) : (
                          <Save size={14} />
                        )}
                        Save
                      </button>
                      <button
                        onClick={() => resetDraft(p)}
                        disabled={!dirty || saving}
                        className="btn-secondary text-sm disabled:opacity-50"
                      >
                        <RotateCcw size={14} />
                        Revert
                      </button>
                      {savedRecently && !dirty && (
                        <span className="text-xs text-success-dark flex items-center gap-1">
                          <Check size={14} />
                          Saved
                        </span>
                      )}
                      <span className="ml-auto text-xs text-text-muted">
                        Last edited{' '}
                        {new Date(p.updatedAt).toLocaleString('en-IN', {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
