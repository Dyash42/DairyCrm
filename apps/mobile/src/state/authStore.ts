/**
 * Auth state lifecycle (port of the Flutter AuthController):
 *
 *   unknown   <- app boot, before we check storage
 *     |
 *     v
 *   signedOut  <->  signedIn(user)
 *
 * The root layout watches `status` and routes between /login and the
 * authenticated stack.
 */
import { create } from 'zustand';

import { authApi, type AuthUser } from '@/api/authApi';
import { isApiError } from '@/api/errors';
import { tokenStore } from '@/api/tokenStore';
import { useRouteStore } from './routeStore';
import { useSyncStore } from './syncStore';

export type AuthStatus = 'unknown' | 'signedOut' | 'signedIn';

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  lastError?: string;
  bootstrap: () => Promise<void>;
  requestOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  status: 'unknown',
  user: null,

  /** On app boot: validate the cached JWT against /auth/me. */
  bootstrap: async () => {
    const token = await tokenStore.read();
    if (!token) {
      set({ status: 'signedOut', user: null });
      return;
    }
    try {
      const me = await authApi.me();
      set({ status: 'signedIn', user: me, lastError: undefined });
      // Scope the offline queue to this executive so their queued scans only
      // ever push under their own token (audit MOB-03).
      useSyncStore.getState().setCurrentExecutive(me.id);
      void useRouteStore.getState().refresh();
      void useSyncStore.getState().refreshDepth();
    } catch (e) {
      if (isApiError(e) && e.kind === 'unauthorized') {
        await tokenStore.clear();
        set({ status: 'signedOut', user: null });
      } else {
        // Network / server down — keep the cached token; show login with a
        // hint. We trust the token until proven invalid by a 401.
        set({ status: 'signedOut', user: null, lastError: 'Could not reach server' });
      }
    }
  },

  /** Step 1 of login: ask the server to send an OTP. */
  requestOtp: async (phone) => {
    await authApi.requestOtp(phone);
  },

  /** Step 2 of login: verify OTP, persist token, flip to signedIn. */
  verifyOtp: async (phone, code) => {
    const { token, user } = await authApi.verifyOtp(phone, code);
    await tokenStore.write(token);
    set({ status: 'signedIn', user, lastError: undefined });
    useSyncStore.getState().setCurrentExecutive(user.id);
    void useRouteStore.getState().refresh();
    void useSyncStore.getState().refreshDepth();
  },

  signOut: async () => {
    await tokenStore.clear();
    set({ status: 'signedOut', user: null });
    // Stop draining the previous user's queued scans under the next login's
    // token. Rows stay tagged with their owner and resume when that user
    // signs back in (audit MOB-03).
    useSyncStore.getState().setCurrentExecutive(null);
    useRouteStore.getState().reset();
  },
}));
