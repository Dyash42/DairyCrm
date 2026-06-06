/**
 * Pause flow — customer pauses deliveries for a date range.
 *
 * Steps: ask_start → ask_end → confirm → done (auto-resume scheduled)
 */

import type { FlowContext, FlowHandler } from '../types';
import { TEMPLATES } from '../templates';

interface PauseCtx {
  startDate?: string; // ISO date YYYY-MM-DD
  endDate?: string;
}

export const pauseFlow: FlowHandler = {
  async matches(ctx) {
    if (
      ctx.state.flow === 'menu' &&
      ctx.message.kind === 'list' &&
      ctx.message.rowId === 'pause'
    ) {
      return true;
    }
    return ctx.state.flow === 'pause';
  },

  async handle(ctx) {
    const phone = ctx.message.from;

    if (ctx.state.flow === 'menu') {
      ctx.patchState({ flow: 'pause', step: 'ask_start', context: {} });
      ctx.send({
        kind: 'text',
        to: phone,
        body: 'Sure. From which date should we pause your deliveries?',
      });
      return;
    }

    const slot = ctx.state.context as PauseCtx;
    if (ctx.message.kind !== 'text' && ctx.message.kind !== 'button') return;
    const text = ctx.message.kind === 'text' ? ctx.message.text.trim() : ctx.message.title;

    switch (ctx.state.step) {
      case 'ask_start': {
        const date = parseLooseDate(text);
        if (!date) {
          ctx.send({
            kind: 'text',
            to: phone,
            body: "Please reply with a date like 'tomorrow' or '3 Jun'.",
          });
          return;
        }
        ctx.patchState({
          step: 'ask_end',
          context: { ...slot, startDate: date } as Record<string, unknown>,
        });
        ctx.send({ kind: 'text', to: phone, body: 'And until which date?' });
        return;
      }

      case 'ask_end': {
        const date = parseLooseDate(text);
        if (!date) {
          ctx.send({
            kind: 'text',
            to: phone,
            body: "Please reply with an end date like '9 Jun'.",
          });
          return;
        }
        const start = slot.startDate ?? date;
        const days = daysBetween(start, date) + 1;
        ctx.patchState({
          step: 'confirm',
          context: { ...slot, endDate: date } as Record<string, unknown>,
        });
        ctx.send({
          kind: 'buttons',
          to: phone,
          body: `To confirm: deliveries paused ${start} – ${date} (${days} days). No milk, no charge for these days.`,
          buttons: [
            { id: 'pause_confirm', title: 'Confirm pause' },
            { id: 'pause_cancel', title: 'Cancel' },
          ],
        });
        return;
      }

      case 'confirm': {
        const confirmed = ctx.message.kind === 'button' && ctx.message.payload === 'pause_confirm';
        if (!confirmed) {
          ctx.send({ kind: 'text', to: phone, body: 'Pause cancelled. Anything else?' });
          ctx.patchState({ flow: null, step: null, context: {} });
          return;
        }
        const start = slot.startDate ?? '';
        const end = slot.endDate ?? '';
        const resumeDate = addOneDay(end);
        if (ctx.state.customerId) {
          await ctx.repos.pauseSubscription({
            customerId: ctx.state.customerId,
            startDate: start,
            endDate: end,
          });
        }
        ctx.send({
          kind: 'template',
          to: phone,
          templateName: TEMPLATES.pause_done.name,
          variables: { start_date: start, end_date: end, resume_date: resumeDate },
        });
        ctx.patchState({ flow: null, step: null, context: {} });
        return;
      }

      default:
        ctx.patchState({ flow: null, step: null, context: {} });
    }
  },
};

/** Tolerant date parser — handles 'tomorrow', '3 Jun', '03/06', '2026-06-03'. */
function parseLooseDate(s: string): string | null {
  const lower = s.toLowerCase().trim();
  if (/^tomorrow$/.test(lower)) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return isoDate(d);
  }
  if (/^today$/.test(lower)) return isoDate(new Date());
  const iso = lower.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return lower;
  const slash = lower.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (slash && slash[1] && slash[2]) {
    const dd = slash[1].padStart(2, '0');
    const mm = slash[2].padStart(2, '0');
    const yy = slash[3] ?? String(new Date().getFullYear());
    return `${yy.length === 2 ? `20${yy}` : yy}-${mm}-${dd}`;
  }
  // "3 Jun" or "3 jun 2026"
  const named = lower.match(/^(\d{1,2})\s+([a-z]{3,})(?:\s+(\d{4}))?$/);
  if (named && named[1] && named[2]) {
    const month = MONTHS[named[2].slice(0, 3) as keyof typeof MONTHS];
    if (month !== undefined) {
      const dd = named[1].padStart(2, '0');
      const yr = named[3] ?? String(new Date().getFullYear());
      return `${yr}-${month}-${dd}`;
    }
  }
  return null;
}

const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
} as const;

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a);
  const db = new Date(b);
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

function addOneDay(iso: string): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + 1);
  return isoDate(d);
}
