/**
 * Auth state lifecycle (PIN-first model):
 *
 *   unknown ─▶ signedOut ──OTP──▶ needsPinSetup ──setPin──▶ signedIn
 *                  ▲                                            │
 *                  │                                       signOut
 *   needsPin ──verifyPin──▶ signedIn        (app launch with a PIN configured)
 *
 * OTP is only needed for first-time setup, a new device, sign-out, "use OTP
 * instead", or a PIN lockout. On every other launch the app locks to a PIN
 * unlock screen and verifies the PIN server-side (with lockout) — cheaper and
 * faster than an OTP each time. The root layout routes between screens by
 * `status`.
 */
import { create } from 'zustand';

import { authApi, type AuthUser } from '@/api/authApi';
import { isApiError } from '@/api/errors';
import { tokenStore } from '@/api/tokenStore';
import { useRouteStore } from './routeStore';
import { useSyncStore } from './syncStore';

export type AuthStatus =
  | 'unknown'
  | 'signedOut'
  | 'signedIn'
  | 'needsPin' // a PIN is configured; app is locked until the user enters it
  | 'needsPinSetup'; // authenticated via OTP but no PIN yet — prompt to create one

interface AuthState {
  status: AuthStatus;
  user: AuthUser | null;
  /** Phone bound to the configured PIN (for the unlock + setup screens). */
  pinPhone: string | null;
  lastError?: string;
  bootstrap: () => Promise<void>;
  requestOtp: (phone: string) => Promise<void>;
  verifyOtp: (phone: string, code: string) => Promise<void>;
  setPin: (pin: string) => Promise<void>;
  verifyPin: (pin: string) => Promise<void>;
  /** Abandon the PIN and fall back to OTP login (forgot PIN / new device). */
  useOtpInstead: () => Promise<void>;
  signOut: () => Promise<void>;
}

function enterApp(user: AuthUser): void {
  // Scope the offline queue to this executive (audit MOB-03) and load the route.
  useSyncStore.getState().setCurrentExecutive(user.id);
  void useRouteStore.getState().refresh();
  void useSyncStore.getState().refreshDepth();
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'unknown',
  user: null,
  pinPhone: null,

  /** On app boot: if a PIN is configured, lock to the PIN screen; otherwise
   *  validate any cached JWT against /auth/me. */
  bootstrap: async () => {
    const [token, pinPhone] = await Promise.all([
      tokenStore.read(),
      tokenStore.readPinPhone(),
    ]);
    if (pinPhone) {
      // PIN configured → require unlock even if a token is still cached.
      set({ status: 'needsPin', pinPhone, user: null });
      return;
    }
    if (!token) {
      set({ status: 'signedOut', user: null });
      return;
    }
    try {
      const me = await authApi.me();
      set({ status: 'signedIn', user: me, lastError: undefined });
      enterApp(me);
    } catch (e) {
      if (isApiError(e) && e.kind === 'unauthorized') {
        await tokenStore.clear();
        set({ status: 'signedOut', user: null });
      } else {
        set({ status: 'signedOut', user: null, lastError: 'Could not reach server' });
      }
    }
  },

  requestOtp: async (phone) => {
    await authApi.requestOtp(phone);
  },

  verifyOtp: async (phone, code) => {
    const { token, user, pinSet } = await authApi.verifyOtp(phone, code);
    await tokenStore.write(token);
    if (pinSet) {
      // Already has a PIN (recovery / new device) — enable PIN + sign in.
      await tokenStore.writePinPhone(phone);
      set({ status: 'signedIn', user, pinPhone: phone, lastError: undefined });
      enterApp(user);
    } else {
      // First-time — keep the token (the set-PIN call is authed) and prompt.
      set({ status: 'needsPinSetup', user, pinPhone: phone, lastError: undefined });
    }
  },

  setPin: async (pin) => {
    await authApi.setPin(pin);
    const phone = get().pinPhone;
    if (phone) await tokenStore.writePinPhone(phone);
    const user = get().user;
    set({ status: 'signedIn', lastError: undefined });
    if (user) enterApp(user);
  },

  verifyPin: async (pin) => {
    const phone = get().pinPhone;
    if (!phone) {
      // No phone bound — fall back to OTP.
      await get().useOtpInstead();
      return;
    }
    const { token, user } = await authApi.verifyPin(phone, pin);
    await tokenStore.write(token);
    set({ status: 'signedIn', user, lastError: undefined });
    enterApp(user);
  },

  useOtpInstead: async () => {
    await Promise.all([tokenStore.clear(), tokenStore.clearPinPhone()]);
    set({ status: 'signedOut', user: null, pinPhone: null });
    useSyncStore.getState().setCurrentExecutive(null);
  },

  signOut: async () => {
    await Promise.all([tokenStore.clear(), tokenStore.clearPinPhone()]);
    set({ status: 'signedOut', user: null, pinPhone: null });
    useSyncStore.getState().setCurrentExecutive(null);
    useRouteStore.getState().reset();
  },
}));
