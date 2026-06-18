import { api } from './client';

export interface AuthUser {
  id: string;
  name: string;
  role: string;
}

function parseUser(j: Record<string, unknown>): AuthUser {
  return {
    id: String(j.id ?? j.sub ?? ''),
    name: String(j.name ?? ''),
    role: String(j.role ?? ''),
  };
}

export const authApi = {
  /**
   * Triggers an OTP send. The server may return 200 even for unknown phones
   * (so we don't leak which numbers are registered). UI should display
   * "if your number is registered, you'll receive an OTP".
   */
  async requestOtp(phone: string): Promise<void> {
    await api.post('/auth/executive/otp/request', { phone });
  },

  /**
   * Verifies the OTP. On success returns the JWT, user, and whether a PIN is
   * already configured server-side (`pinSet`). When false, the app prompts the
   * executive to create a PIN for faster subsequent unlocks.
   */
  async verifyOtp(
    phone: string,
    code: string,
  ): Promise<{ token: string; user: AuthUser; pinSet: boolean }> {
    const res = await api.post('/auth/executive/otp/verify', { phone, code });
    const data = res.data as { token: string; user: Record<string, unknown>; pinSet?: boolean };
    return { token: data.token, user: parseUser(data.user), pinSet: Boolean(data.pinSet) };
  },

  /** Sets/replaces the device-unlock PIN. Requires a valid JWT (post-OTP). */
  async setPin(pin: string): Promise<void> {
    await api.post('/auth/executive/pin/set', { pin });
  },

  /** Unlocks with phone + PIN, returns a fresh JWT + user. */
  async verifyPin(
    phone: string,
    pin: string,
  ): Promise<{ token: string; user: AuthUser; pinSet: boolean }> {
    const res = await api.post('/auth/executive/pin/verify', { phone, pin });
    const data = res.data as { token: string; user: Record<string, unknown>; pinSet?: boolean };
    return { token: data.token, user: parseUser(data.user), pinSet: Boolean(data.pinSet) };
  },

  /** Reads the logged-in user (used to validate a cached JWT on app start). */
  async me(): Promise<AuthUser> {
    const res = await api.get('/auth/me');
    const data = res.data as { user: Record<string, unknown> };
    return parseUser(data.user);
  },
};
