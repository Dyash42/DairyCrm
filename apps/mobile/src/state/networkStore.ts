/**
 * Connectivity store — wraps @react-native-community/netinfo so the rest of
 * the app doesn't import it directly. Port of the Flutter connectivity provider.
 *
 * `online` requires BOTH a network interface AND reachable internet. A captive
 * portal or a rural cell with signal-but-no-data reports isConnected=true while
 * isInternetReachable=false — in that state pushes time out instead of queuing
 * (audit MIL-05). We treat reachable!==false as online (null = unknown ⇒
 * optimistic) but a definite false as offline so scans queue instead of failing.
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { create } from 'zustand';

interface NetworkState {
  online: boolean;
  initialized: boolean;
  init: () => void;
}

function deriveOnline(state: NetInfoState): boolean {
  return state.isConnected === true && state.isInternetReachable !== false;
}

let unsubscribe: (() => void) | null = null;

export const useNetworkStore = create<NetworkState>((set) => ({
  online: true,
  initialized: false,
  init: () => {
    if (unsubscribe) return; // already subscribed
    // Seed the initial value.
    NetInfo.fetch().then((state) => {
      set({ online: deriveOnline(state) });
    });
    unsubscribe = NetInfo.addEventListener((state) => {
      set({ online: deriveOnline(state) });
    });
    set({ initialized: true });
  },
}));

/** Read-only helper for non-React call sites (stores). */
export function isOnline(): boolean {
  return useNetworkStore.getState().online;
}
