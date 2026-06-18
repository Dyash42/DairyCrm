/**
 * Pause flow — customer pauses deliveries for a date range.
 *
 * Steps: ask_start → ask_end → confirm → done (auto-resume scheduled)
 */

import type { FlowContext, FlowHandler } from '../types';
import { TEMPLATES } from '../templates';
import { getPrompt } from '../prompts';
import { settings } from '../../services/settings';
import { startOfBusinessDayUTC, addDays, isoDate } from '../../utils/dates';

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
      ctx.send({ kind: 'text', to: phone, body: getPrompt('pause.ask_start').body });
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
            body: getPrompt('pause.ask_start.retry_invalid_date').body,
          });
          return;
        }
        // PRD §4 "System validates dates": reject a start date in the past
        // (compared against the IST business day — see CUS-08).
        if (date < isoDate(startOfBusinessDayUTC())) {
          ctx.send({
            kind: 'text',
            to: phone,
            body: getPrompt('pause.ask_start.retry_past').body,
          });
          return;
        }
        ctx.patchState({
          step: 'ask_end',
          context: { ...slot, startDate: date } as Record<string, unknown>,
        });
        ctx.send({ kind: 'text', to: phone, body: getPrompt('pause.ask_end').body });
        return;
      }

      case 'ask_end': {
        const date = parseLooseDate(text);
        if (!date) {
          ctx.send({
            kind: 'text',
            to: phone,
            body: getPrompt('pause.ask_end.retry_invalid_date').body,
          });
          return;
        }
        const start = slot.startDate ?? date;
        // Reject an inverted range (end before start) — otherwise daysBetween
        // goes negative and we'd persist a bad pause + AutoResumeJob.
        if (date < start) {
          ctx.send({
            kind: 'text',
            to: phone,
            body: getPrompt('pause.ask_end.retry_before_start').body,
          });
          return;
        }
        const days = daysBetween(start, date) + 1;
        // Enforce the same pause cap the admin path does (audit CUS-03): the
        // bot had no limit, so a customer could pause for years with a far-out
        // AutoResumeJob.
        const maxDays = await settings.getNumber('pause.max_days', 60);
        if (days > maxDays) {
          ctx.send({
            kind: 'text',
            to: phone,
            body: `Deliveries can be paused for at most ${maxDays} days. Please pick an earlier end date.`,
          });
          return;
        }
        ctx.patchState({
          step: 'confirm',
          context: { ...slot, endDate: date } as Record<string, unknown>,
        });
        const p = getPrompt('pause.confirm.body', { start, date, days });
        ctx.send({
          kind: 'buttons',
          to: phone,
          body: p.body,
          buttons: p.buttons ?? [],
        });
        return;
      }

      case 'confirm': {
        const confirmed = ctx.message.kind === 'button' && ctx.message.payload === 'pause_confirm';
        if (!confirmed) {
          ctx.send({ kind: 'text', to: phone, body: getPrompt('pause.confirm.cancelled').body });
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
  // "today"/"tomorrow" anchored to the BUSINESS day (IST), not the server's
  // local/UTC day — a customer messaging at 02:00 IST (= 20:30 UTC the previous
  // day) would otherwise pause starting "yesterday" (audit CUS-08).
  if (/^tomorrow$/.test(lower)) return isoDate(addDays(startOfBusinessDayUTC(), 1));
  if (/^today$/.test(lower)) return isoDate(startOfBusinessDayUTC());
  const iso = lower.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return lower;
  const slash = lower.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (slash && slash[1] && slash[2]) {
    const dd = slash[1].padStart(2, '0');
    const mm = slash[2].padStart(2, '0');
    const yy = slash[3] ?? String(startOfBusinessDayUTC().getUTCFullYear());
    return `${yy.length === 2 ? `20${yy}` : yy}-${mm}-${dd}`;
  }
  // "3 Jun" or "3 jun 2026"
  const named = lower.match(/^(\d{1,2})\s+([a-z]{3,})(?:\s+(\d{4}))?$/);
  if (named && named[1] && named[2]) {
    const month = MONTHS[named[2].slice(0, 3) as keyof typeof MONTHS];
    if (month !== undefined) {
      const dd = named[1].padStart(2, '0');
      const yr = named[3] ?? String(startOfBusinessDayUTC().getUTCFullYear());
      return `${yr}-${month}-${dd}`;
    }
  }
  return null;
}

const MONTHS = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
} as const;

// isoDate / addDays / startOfBusinessDayUTC are imported from utils/dates so
// all date math here is UTC/business-TZ aligned (audit CUS-08). The previous
// local-time helpers used getFullYear/getMonth/getDate, which silently shifted
// dates by a day on a UTC-clock server.

function daysBetween(a: string, b: string): number {
  // a, b are 'YYYY-MM-DD'. Parse as explicit UTC midnight so the diff is a
  // whole number of days regardless of the server's clock.
  const da = new Date(`${a}T00:00:00.000Z`);
  const db = new Date(`${b}T00:00:00.000Z`);
  return Math.round((db.getTime() - da.getTime()) / 86_400_000);
}

function addOneDay(iso: string): string {
  return isoDate(addDays(new Date(`${iso}T00:00:00.000Z`), 1));
}
