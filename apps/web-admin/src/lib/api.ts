/**
 * Typed API client for the Jharanai backend.
 *
 * - One `apiFetch` wrapper that adds Authorization, handles 401, and
 *   surfaces structured errors.
 * - Token lives in localStorage (simple, works without backend cookie config).
 *   Move to HttpOnly cookies once we have the same-origin proxy / Vercel
 *   rewrite in place.
 * - All screen code goes through the typed helpers below — never `fetch()`
 *   inline. Easy to swap to react-query or SWR later.
 */

const TOKEN_KEY = 'jharanai_admin_token';

export const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
}

export interface ApiOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  authenticated?: boolean; // default true
}

export async function apiFetch<T>(
  path: string,
  opts: ApiOptions = {},
): Promise<T> {
  const { body, headers, authenticated = true, ...rest } = opts;
  const finalHeaders: Record<string, string> = {
    Accept: 'application/json',
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...((headers as Record<string, string>) ?? {}),
  };
  if (authenticated) {
    const token = getToken();
    if (token) finalHeaders.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: finalHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (res.status === 401) {
    clearToken();
    // Don't redirect here — let the AuthProvider/listener handle it.
  }

  let payload: unknown = null;
  const text = await res.text();
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }

  if (!res.ok) {
    const message =
      (payload as { message?: string; error?: string })?.message ??
      (payload as { error?: string })?.error ??
      `HTTP ${res.status}`;
    throw new ApiError(res.status, message, payload);
  }

  return payload as T;
}

// ----------------------- Typed endpoint helpers -----------------------

export interface AdminLoginResponse {
  token: string;
  user: { id: string; name: string; role: 'ADMIN' };
}

export function loginAdmin(email: string, password: string) {
  return apiFetch<AdminLoginResponse>('/auth/admin/login', {
    method: 'POST',
    authenticated: false,
    body: { email, password },
  });
}

export function fetchMe() {
  return apiFetch<{
    user: { sub: string; role: 'ADMIN' | 'EXECUTIVE'; name: string };
  }>('/auth/me');
}

export function fetchDashboardMetrics(range: 'TODAY' | 'WEEK' | 'MONTH') {
  return apiFetch<DashboardMetricsPayload>(
    `/dashboard/metrics?range=${range}`,
  );
}

export function fetchRoutes() {
  return apiFetch<{ routes: RoutePayload[] }>('/routes');
}

export function fetchCustomers(params: {
  q?: string;
  status?: string;
  limit?: number;
} = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.status) qs.set('status', params.status);
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return apiFetch<{ customers: CustomerPayload[]; nextCursor: string | null }>(
    `/customers${q ? `?${q}` : ''}`,
  );
}

// ----------------------- Shared payload shapes -----------------------
// Loose shapes that mirror the backend Prisma rows — refine later.

export interface DashboardMetricsPayload {
  range: 'TODAY' | 'WEEK' | 'MONTH';
  litresDelivered: number;
  litresDeltaPct: number;
  customersServed: number;
  customersScheduled: number;
  customersDeltaPct: number;
  revenue: number;
  revenueDeltaPct: number;
  completionPct: number;
  completionDeltaPct: number;
  hourlyDelivery: Array<{ hour: number; litres: number }>;
  breakdown: { pending: number; missed: number; paused: number; newToday: number };
  byRoute: Array<{ routeName: string; litres: number; completionPct: number }>;
  subscriptions: { active: number; paused: number; cancelled: number; total: number };
}

export interface RoutePayload {
  id: string;
  name: string;
  area: string;
  pinCodes: string[];
  customerCount: number;
  executive: { id: string; name: string } | null;
}

export interface CustomerPayload {
  id: string;
  code: string;
  name: string;
  phone: string;
  addressLine1: string;
  routeId: string | null;
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
  litresPerDay: string | number;
  balance: string | number;
}
