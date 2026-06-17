'use client';

/**
 * Admin WhatsApp bot tester.
 *
 * Drives the real conversation engine (same code that handles inbound
 * Meta webhooks) and renders the bot's outbound actions as chat bubbles.
 * Only useful when MESSAGING_PROVIDER=stub — with a real Meta config,
 * outbound goes straight to the customer's phone and never reaches our
 * capture sink (the backend returns 409 then).
 *
 * Quick tour:
 *   1. Pick a phone (defaults to the seeded customer Sunil Pradhan).
 *   2. Type any message → see the bot reply.
 *   3. Buttons in the bot reply are clickable — they fire a `button`
 *      inbound exactly like Meta would.
 *   4. The status pill in the header shows the current flow + step so
 *      you can verify state transitions during the demo.
 */

import { useEffect, useRef, useState } from 'react';
import { RotateCcw, Send, MessageSquare, Pencil } from 'lucide-react';

import { Topbar } from '@/components/shell/Topbar';
import { Card, CardBody } from '@/components/ui/Card';
import { StatusPill } from '@/components/ui/StatusPill';
import {
  botSend,
  botReset,
  ApiError,
  type BotOutbound,
  type BotSendResult,
} from '@/lib/api';
import { PromptsTab } from './PromptsTab';

type Tab = 'tester' | 'prompts';

interface ChatMessage {
  id: string;
  side: 'in' | 'out'; // in = from customer, out = from bot
  rendered: React.ReactNode;
}

const SEED_PHONES: Array<{ label: string; phone: string }> = [
  { label: 'Existing customer — Sunil Pradhan', phone: '+919111111111' },
  { label: 'Existing customer — Subhransu Behera', phone: '+919111111112' },
  { label: 'Existing customer — Anita Sahoo', phone: '+919111111113' },
  { label: 'NEW number (onboarding flow)', phone: '+919555555501' },
];

export default function BotTesterPage() {
  const [tab, setTab] = useState<Tab>('tester');
  const [phone, setPhone] = useState(SEED_PHONES[0]!.phone);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<BotSendResult['state']>(null);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll on new messages.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [history.length]);

  async function sendText() {
    const trimmed = text.trim();
    if (trimmed === '' || busy) return;
    await runInbound({ kind: 'text', from: phone, text: trimmed }, trimmed);
    setText('');
  }

  async function clickButton(button: { id: string; title: string }) {
    await runInbound(
      { kind: 'button', from: phone, payload: button.id, title: button.title },
      button.title,
    );
  }

  async function clickListRow(row: { id: string; title: string }) {
    await runInbound(
      { kind: 'list', from: phone, rowId: row.id, title: row.title },
      row.title,
    );
  }

  async function runInbound(
    body: Parameters<typeof botSend>[0],
    displayLabel: string,
  ) {
    setError(null);
    setBusy(true);
    const inMsg: ChatMessage = {
      id: `in-${Date.now()}`,
      side: 'in',
      rendered: <PlainBubble side="in" body={displayLabel} />,
    };
    setHistory((h) => [...h, inMsg]);
    try {
      const res = await botSend(body);
      setState(res.state);
      const outMsgs: ChatMessage[] = res.outbound.map((action, i) => ({
        id: `out-${Date.now()}-${i}`,
        side: 'out',
        rendered: <OutboundBubble action={action} onButton={clickButton} onListRow={clickListRow} />,
      }));
      setHistory((h) => [...h, ...outMsgs]);
      if (res.outbound.length === 0) {
        // Bot intentionally said nothing (e.g. acknowledged with no reply).
        // Show a faint "no reply" marker so the tester knows it ran.
        setHistory((h) => [
          ...h,
          {
            id: `silent-${Date.now()}`,
            side: 'out',
            rendered: <SilentBubble />,
          },
        ]);
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Bot send failed');
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setError(null);
    setBusy(true);
    try {
      await botReset(phone);
      setHistory([]);
      setState(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Reset failed');
    } finally {
      setBusy(false);
    }
  }

  function changePhone(next: string) {
    setPhone(next);
    setHistory([]);
    setState(null);
    setError(null);
  }

  return (
    <>
      <Topbar
        title="Bot tester"
        subtitle="Drive the WhatsApp conversation engine — same code as production"
      />

      <div className="px-8 pt-4 flex items-center gap-1 border-b border-border">
        <TabButton active={tab === 'tester'} onClick={() => setTab('tester')} icon={<MessageSquare size={14} />}>
          Tester
        </TabButton>
        <TabButton active={tab === 'prompts'} onClick={() => setTab('prompts')} icon={<Pencil size={14} />}>
          Prompts
        </TabButton>
      </div>

      {tab === 'prompts' ? (
        <div className="px-8 py-6 flex-1 overflow-y-auto">
          <PromptsTab />
        </div>
      ) : (
      <div className="px-8 py-6 flex-1 overflow-hidden flex flex-col max-w-4xl">
        {/* Controls */}
        <Card className="mb-4">
          <CardBody className="flex items-center gap-3 flex-wrap">
            <label className="text-sm text-text-secondary">As phone:</label>
            <select
              value={phone}
              onChange={(e) => changePhone(e.target.value)}
              className="input"
            >
              {SEED_PHONES.map((s) => (
                <option key={s.phone} value={s.phone}>
                  {s.label} · {s.phone}
                </option>
              ))}
            </select>
            <div className="ml-auto flex items-center gap-2">
              {state?.flow ? (
                <StatusPill tone="info">
                  {state.flow} → {state.step ?? 'start'}
                </StatusPill>
              ) : (
                <StatusPill tone="muted">no flow yet</StatusPill>
              )}
              <button onClick={reset} className="btn-secondary" disabled={busy}>
                <RotateCcw size={14} />
                Reset session
              </button>
            </div>
          </CardBody>
        </Card>

        {/* Chat */}
        <Card className="flex-1 overflow-hidden flex flex-col">
          <div
            ref={scrollRef}
            className="flex-1 overflow-y-auto p-6 space-y-3 bg-surface-muted"
          >
            {history.length === 0 && (
              <div className="text-center text-text-muted py-12">
                <MessageSquare
                  size={32}
                  className="mx-auto mb-2 text-text-muted"
                />
                <div className="text-sm">
                  Type a message below to start the conversation.
                </div>
                <div className="text-xs mt-1">
                  Try <code className="bg-surface px-1 rounded">hi</code> from a new
                  number to see onboarding kick off.
                </div>
              </div>
            )}
            {history.map((m) => (
              <div
                key={m.id}
                className={`flex ${m.side === 'in' ? 'justify-end' : 'justify-start'}`}
              >
                {m.rendered}
              </div>
            ))}
          </div>

          {/* Composer */}
          <div className="border-t border-border p-4 flex gap-2 items-end bg-surface">
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendText();
                }
              }}
              placeholder="Type a message as the customer…"
              rows={1}
              disabled={busy}
              className="input flex-1 resize-none"
            />
            <button
              onClick={sendText}
              disabled={busy || text.trim() === ''}
              className="btn-primary disabled:opacity-50 h-10 px-4"
            >
              <Send size={16} />
              Send
            </button>
          </div>
        </Card>

        {error && (
          <div className="bg-danger-light text-danger-dark text-sm rounded-lg p-3 mt-3">
            {error}
          </div>
        )}
      </div>
      )}
    </>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
        active
          ? 'border-brand text-text-primary'
          : 'border-transparent text-text-secondary hover:text-text-primary'
      }`}
    >
      {icon}
      {children}
    </button>
  );
}

// ---------- Bubble components ----------

function PlainBubble({ side, body }: { side: 'in' | 'out'; body: string }) {
  return (
    <div
      className={`rounded-2xl px-4 py-2.5 max-w-[80%] whitespace-pre-wrap text-sm leading-relaxed shadow-sm ${
        side === 'in'
          ? 'bg-brand text-white rounded-br-sm'
          : 'bg-surface border border-border text-text-primary rounded-bl-sm'
      }`}
    >
      {body}
    </div>
  );
}

function SilentBubble() {
  return (
    <div className="italic text-xs text-text-muted px-4 py-2">
      (bot acknowledged — no message sent)
    </div>
  );
}

function OutboundBubble({
  action,
  onButton,
  onListRow,
}: {
  action: BotOutbound;
  onButton: (b: { id: string; title: string }) => void;
  onListRow: (r: { id: string; title: string }) => void;
}) {
  if (action.kind === 'text') {
    return <PlainBubble side="out" body={action.body} />;
  }
  if (action.kind === 'template') {
    return (
      <div className="bg-surface border border-border rounded-2xl rounded-bl-sm shadow-sm max-w-[80%] overflow-hidden">
        <div className="px-4 py-2 bg-surface-muted border-b border-border text-xs uppercase tracking-wide text-text-muted font-semibold">
          Template · {action.templateName}
        </div>
        <div className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-text-primary">
          {renderTemplatePreview(action.templateName, action.variables)}
        </div>
        {action.variables && Object.keys(action.variables).length > 0 && (
          <details className="px-4 py-2 bg-surface-muted border-t border-border text-xs">
            <summary className="cursor-pointer text-text-secondary">
              Variables ({Object.keys(action.variables).length})
            </summary>
            <pre className="mt-2 text-xs text-text-secondary overflow-x-auto">
              {JSON.stringify(action.variables, null, 2)}
            </pre>
          </details>
        )}
      </div>
    );
  }
  if (action.kind === 'buttons') {
    return (
      <div className="bg-surface border border-border rounded-2xl rounded-bl-sm shadow-sm max-w-[80%] overflow-hidden">
        <div className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-text-primary">
          {action.body}
        </div>
        <div className="px-3 pb-3 flex flex-wrap gap-2">
          {action.buttons.map((b) => (
            <button
              key={b.id}
              onClick={() => onButton(b)}
              className="px-3 py-1.5 text-sm rounded-full border border-brand text-brand hover:bg-brand hover:text-white transition-colors"
            >
              {b.title}
            </button>
          ))}
        </div>
      </div>
    );
  }
  if (action.kind === 'list') {
    return (
      <div className="bg-surface border border-border rounded-2xl rounded-bl-sm shadow-sm max-w-[80%] overflow-hidden">
        <div className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-text-primary">
          {action.body}
        </div>
        <div className="px-3 pb-3 space-y-2">
          {action.sections.map((s, si) => (
            <div key={si}>
              <div className="text-xs font-semibold text-text-muted uppercase tracking-wide px-2 py-1">
                {s.title}
              </div>
              <div className="space-y-1">
                {s.rows.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => onListRow(r)}
                    className="block w-full text-left px-3 py-2 rounded-lg border border-border hover:border-brand hover:bg-brand-50 transition-colors"
                  >
                    <div className="text-sm font-semibold text-text-primary">
                      {r.title}
                    </div>
                    {r.description && (
                      <div className="text-xs text-text-secondary mt-0.5">
                        {r.description}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  if (action.kind === 'image') {
    return (
      <div className="bg-surface border border-border rounded-2xl rounded-bl-sm shadow-sm max-w-[80%] overflow-hidden">
        <img src={action.mediaUrl} alt="" className="w-full" />
        {action.caption && (
          <div className="px-4 py-2 text-sm text-text-primary">{action.caption}</div>
        )}
      </div>
    );
  }
  return <PlainBubble side="out" body={JSON.stringify(action)} />;
}

/**
 * Cheap client-side preview of what a template's body would look like
 * after variable substitution. The actual Meta template bodies live in
 * apps/backend/src/whatsapp/templates.ts — keep the strings in sync.
 */
function renderTemplatePreview(
  templateName: string,
  variables?: Record<string, string>,
): string {
  const TEMPLATES: Record<string, string> = {
    onboarding_welcome:
      "Welcome to Jharanai Dairy! Reply with your name to get started.",
    onboarding_account_ready:
      "You're all set, {customer_code}. Cow milk @ ₹64/L will be delivered every morning.",
    onboarding_payment_link:
      '{litres} litre × {days} days × ₹{rate} = ₹{total}. Here is your secure payment link.',
    subscription_activated:
      "Subscription active 🎉 You'll get {litres_per_day} L/day from tomorrow morning.",
    menu_returning: 'Welcome back, {name}! 👋 What would you like to do today?',
    renew_ask_days:
      'Your current plan is {litres_per_day} litre/day. Which days of the week should we deliver?',
    renew_quote:
      '{day_pattern} for {duration_days} days = {delivery_count} deliveries. {delivery_count} × {litres_per_day} L × ₹{rate} = ₹{total}.',
    renew_confirmed:
      'Payment received ✅\nYour schedule is updated — next delivery tomorrow morning. Thank you, {name}!',
    renewal_reminder:
      'Hi {name}, your milk subscription ends on {end_date}. Reply RENEW to continue without interruption — it takes 30 seconds.',
    pause_confirm: 'Pause your deliveries from {from} to {to} ({days} days)?',
    pause_done: 'Pause confirmed. Deliveries resume on {resume_date}. See you then!',
    auto_resume_reminder:
      'Hi {name}, your deliveries resume tomorrow ({litres_per_day} L/day).',
    resume_ask: 'Resume deliveries now or pick a date?',
    resume_done: "You're back on the route — see you in the morning, {name}!",
    support_menu: 'How can we help, {name}?',
    support_missed_ask_date: 'Which date did the delivery miss?',
    support_credit_applied: '₹{amount} credit applied to your account. Sorry about that!',
    support_close: 'Glad we could help. Have a great day!',
    delivery_confirmation:
      "Delivered {litres} L to {address_short} today. Thanks for being with Jharanai!",
    broadcast_route_update: '{message}',
  };
  let body = TEMPLATES[templateName] ?? `(${templateName})`;
  for (const [k, v] of Object.entries(variables ?? {})) {
    body = body.replaceAll(`{${k}}`, v);
  }
  return body;
}
