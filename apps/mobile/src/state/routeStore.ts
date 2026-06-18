/**
 * Today's-route store. Holds the route summary + the data-source flag so the
 * UI can show a "live"/"demo" state. Port of the Flutter RouteNotifier.
 *
 * IMPORTANT (audit fix): markDelivered/markSkipped only update OPTIMISTIC
 * local UI state. They do NOT call the server. All server writes go through
 * the single syncStore.recordScan -> /confirm queue path (which carries the
 * cash). The Flutter app fired a second, cashless /confirm here too, which —
 * because the backend confirm is idempotent on the PENDING row — silently
 * dropped door cash whenever the device was online. Routing every write
 * through one path removes that double-confirm.
 */
import { create } from 'zustand';

import { deliveryApi } from '@/api/deliveryApi';
import { isApiError } from '@/api/errors';
import { routeDateLabel } from '@/lib/date';
import {
  DeliveryStatus,
  DeliveryStop,
  RouteSummary,
  emptySummary,
} from '@/models/delivery';
import { useAuthStore } from './authStore';
import { DemoMode, demoSummary } from './demo';

export type RouteDataSource = 'loading' | 'live' | 'demo' | 'error';

interface RouteState {
  summary: RouteSummary;
  source: RouteDataSource;
  errorMessage?: string;
  /** MIL-09: server returned routeId:null — this executive has no route assigned
   *  (distinct from a still-loading / empty-network state). */
  noRouteAssigned: boolean;
  demoMode: DemoMode;
  refresh: () => Promise<void>;
  markDelivered: (stopId: string, litres: number) => void;
  markSkipped: (stopId: string) => void;
  setDemoMode: (mode: DemoMode) => void;
  reset: () => void;
}

function patchStop(
  summary: RouteSummary,
  id: string,
  fn: (s: DeliveryStop) => DeliveryStop,
): RouteSummary {
  return new RouteSummary({
    executiveName: summary.executiveName,
    dateLabel: summary.dateLabel,
    routeLabel: summary.routeLabel,
    stops: summary.stops.map((s) => (s.id === id ? fn(s) : s)),
  });
}

export const useRouteStore = create<RouteState>((set, get) => ({
  summary: emptySummary(),
  source: 'loading',
  noRouteAssigned: false,
  demoMode: 'off',

  refresh: async () => {
    if (get().demoMode !== 'off') return;
    set({ source: 'loading' });
    try {
      const res = await deliveryApi.todaysRoute();
      const execName = useAuthStore.getState().user?.name ?? 'Sales Executive';
      const summary = new RouteSummary({
        executiveName: execName,
        dateLabel: routeDateLabel(res.date),
        routeLabel: res.routeId == null ? 'No route assigned' : 'Today',
        stops: res.stops,
      });
      set({
        summary,
        source: 'live',
        errorMessage: undefined,
        noRouteAssigned: res.routeId == null,
      });
    } catch (e) {
      // Keep whatever we had; flag the error (the data doesn't vanish).
      const message = isApiError(e) ? e.message : String(e);
      set({ source: 'error', errorMessage: message });
    }
  },

  markDelivered: (stopId, litres) => {
    set((state) => ({
      summary: patchStop(state.summary, stopId, (s) => {
        const isPartial = litres < s.scheduledLitres;
        const status: DeliveryStatus = isPartial ? 'partial' : 'delivered';
        return s.copyWith({
          status,
          deliveredLitres: litres,
          scannedAt: new Date(),
        });
      }),
    }));
  },

  markSkipped: (stopId) => {
    set((state) => ({
      summary: patchStop(state.summary, stopId, (s) =>
        s.copyWith({ status: 'skipped' }),
      ),
    }));
  },

  setDemoMode: (mode) => {
    if (mode === 'off') {
      set({ demoMode: 'off' });
      void get().refresh();
    } else {
      set({ demoMode: mode, summary: demoSummary(mode), source: 'demo' });
    }
  },

  reset: () => {
    set({ summary: emptySummary(), source: 'loading', errorMessage: undefined });
  },
}));
