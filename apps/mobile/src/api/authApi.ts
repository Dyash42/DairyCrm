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

  /** Verifies the OTP. On success returns the JWT and user. */
  async verifyOtp(
    phone: string,
    code: string,
  ): Promise<{ token: string; user: AuthUser }> {
    const res = await api.post('/auth/executive/otp/verify', { phone, code });
    const data = res.data as { token: string; user: Record<string, unknown> };
    return { token: data.token, user: parseUser(data.user) };
  },

  /** Reads the logged-in user (used to validate a cached JWT on app start). */
  async me(): Promise<AuthUser> {
    const res = await api.get('/auth/me');
    const data = res.data as { user: Record<string, unknown> };
    return parseUser(data.user);
  },
};
