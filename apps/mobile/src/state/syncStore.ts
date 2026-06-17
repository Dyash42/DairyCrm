/**
 * Offline-first sync engine. Watches connectivity + the offline queue and
 * drains the queue when the network returns. Port of the Flutter SyncEngine.
 *
 * Failure handling (audit MIL-01/MOB-02 — the queue used to be a poison-pill):
 *   - Push scans one at a time, oldest first, scoped to the current executive.
 *   - On a PERMANENT error (403/404/409/422 — the row will never succeed) or
 *     after MAX_ATTEMPTS transient failures, the row is moved to `failed` and
 *     the pass CONTINUES so good rows still flush. Failed rows are surfaced
 *     via `failedDepth` for manual attention instead of silently retrying
 *     forever and blocking the whole queue.
 *   - On a TRANSIENT error (network/timeout/5xx) below the cap, the row is
 *     bumped back to pending and the pass stops; the next online tick retries.
 *   - We never drop a row until the server returns 2xx or it's a confirmed
 *     permanent reject. Server-side idempotency makes a duplicate push safe.
 *
 * Platform note: the queue uses SQLite, which isn't available on web. When
 * the queue can't initialise we set `queueAvailable = false` and (a) skip all
 * SQLite calls and (b) push confirms DIRECTLY to the API, so the web preview
 * still works online.
 */
import { create } from 'zustand';

import { deliveryApi } from '@/api/deliveryApi';
import { ApiError, isApiError } from '@/api/errors';
import { db } from '@/storage/database';
import { isOnline, useNetworkStore } from './networkStore';

export type SyncStatus = 'idle' | 'syncing' | 'allClear' | 'error';

/** False when the local SQLite queue couldn't initialise (e.g. on web). */
let queueAvailable = true;

/** Max transient retries before a row is parked as failed. */
const MAX_ATTEMPTS = 8;

/** Error kinds that will NEVER succeed on retry — park the row immediately. */
const PERMANENT_KINDS = new Set<ApiError['kind']>([
  'forbidden',
  'notFound',
  'conflict',
  'validation',
]);

interface SyncState {
  status: SyncStatus;
  queueDepth: number;
  failedDepth: number;
  lastError?: string;
  initialized: boolean;
  /** Owning executive for queue rows; set on login, cleared on signOut. */
  currentExecutiveId: string | null;
  setCurrentExecutive: (id: string | null) => void;
  init: () => Promise<void>;
  refreshDepth: () => Promise<void>;
  recordScan: (params: {
    deliveryId: string;
    customerCode: string;
    deliveredLitres: number;
    cashCollected?: number | null;
    note?: string | null;
    kind?: string;
  }) => Promise<void>;
  drain: () => Promise<void>;
  drainNow: () => Promise<void>;
}

export const useSyncStore = create<SyncState>((set, get) => ({
  status: 'idle',
  queueDepth: 0,
  failedDepth: 0,
  initialized: false,
  currentExecutiveId: null,

  setCurrentExecutive: (id) => {
    set({ currentExecutiveId: id });
  },

  init: async () => {
    if (get().initialized) return;
    set({ initialized: true });
    // The offline queue uses SQLite. If it can't initialise (e.g. web), mark
    // it unavailable and degrade gracefully — the app still works online.
    try {
      await db.init();
      queueAvailable = true;
      await get().refreshDepth();
    } catch (e) {
      queueAvailable = false;
      // eslint-disable-next-line no-console
      console.log('[sync] offline queue unavailable on this platform:', e);
    }
    // Drain whenever connectivity transitions offline -> online.
    useNetworkStore.subscribe((state, prev) => {
      if (state.online && !prev.online) {
        void get().drain();
      }
    });
    if (isOnline()) void get().drain();
  },

  refreshDepth: async () => {
    if (!queueAvailable) {
      set({ queueDepth: 0, failedDepth: 0 });
      return;
    }
    const execId = get().currentExecutiveId;
    const [pending, failed] = await Promise.all([
      db.countPending(execId),
      db.countFailed(execId),
    ]);
    set({ queueDepth: pending, failedDepth: failed });
  },

  recordScan: async (params) => {
    const kind = params.kind ?? 'DELIVERED';

    // No local queue (web): push straight to the API, best-effort.
    if (!queueAvailable) {
      try {
        if (kind === 'SKIPPED') {
          await deliveryApi.skip({ deliveryId: params.deliveryId, reason: params.note });
        } else {
          await deliveryApi.confirm({
            deliveryId: params.deliveryId,
            deliveredLitres: params.deliveredLitres,
            cashCollected: params.cashCollected,
            note: params.note,
          });
        }
        set({ status: 'allClear', lastError: undefined });
      } catch (e) {
        set({ status: 'error', lastError: isApiError(e) ? e.message : String(e) });
      }
      return;
    }

    await db.enqueue({
      deliveryId: params.deliveryId,
      customerCode: params.customerCode,
      deliveredLitres: params.deliveredLitres,
      cashCollected: params.cashCollected ?? null,
      note: params.note ?? null,
      kind,
      executiveId: get().currentExecutiveId,
    });
    await get().refreshDepth();
    if (isOnline()) {
      // Fire and forget — let it run in the background.
      void get().drain();
    }
  },

  drain: async () => {
    if (!queueAvailable) return;
    if (get().status === 'syncing') return;
    const execId = get().currentExecutiveId;
    set({ status: 'syncing' });
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const batch = await db.takeNext(1, execId);
      if (batch.length === 0) break;
      const row = batch[0];
      await db.markSyncing(row.id);
      try {
        if (row.kind === 'SKIPPED') {
          await deliveryApi.skip({
            deliveryId: row.deliveryId,
            reason: row.note,
          });
        } else {
          await deliveryApi.confirm({
            deliveryId: row.deliveryId,
            deliveredLitres: row.deliveredLitres,
            cashCollected: row.cashCollected,
            note: row.note,
          });
        }
        await db.markPushed(row.id);
      } catch (e) {
        const apiErr = isApiError(e) ? e : null;
        const message = apiErr ? apiErr.message : String(e);
        const permanent = apiErr ? PERMANENT_KINDS.has(apiErr.kind) : false;
        const attempts = row.attempts + 1;

        if (permanent || attempts >= MAX_ATTEMPTS) {
          // Poison row: park it as failed and KEEP draining newer rows so one
          // bad scan can't block the whole day's deliveries/cash (MIL-01).
          await db.markFailed(
            row.id,
            permanent ? `permanent (${apiErr?.kind}): ${message}` : `gave up after ${attempts}: ${message}`,
          );
          set({ lastError: message });
          continue;
        }
        // Transient: bump + stop; the next online tick retries from the head.
        await db.bumpAttempt(row.id, message);
        set({ status: 'error', lastError: message });
        await get().refreshDepth();
        return;
      }
    }
    await get().refreshDepth();
    const failed = get().failedDepth;
    set({
      status: failed > 0 ? 'error' : 'allClear',
      lastError: failed > 0 ? `${failed} scan(s) could not sync — need attention` : undefined,
    });
  },

  drainNow: async () => {
    await get().drain();
  },
}));
