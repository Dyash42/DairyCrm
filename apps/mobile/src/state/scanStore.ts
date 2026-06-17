import { create } from 'zustand';

/**
 * Decouples the scanner route from the home screen. The scanner sets the
 * decoded code and navigates back; the home screen observes `lastScan`,
 * resolves it to a route stop (or looks it up by code), opens the confirm
 * sheet, then clears it.
 */
interface ScanState {
  lastScan: { code: string; ts: number } | null;
  setLastScan: (code: string) => void;
  clear: () => void;
}

export const useScanStore = create<ScanState>((set) => ({
  lastScan: null,
  setLastScan: (code) => set({ lastScan: { code, ts: Date.now() } }),
  clear: () => set({ lastScan: null }),
}));
