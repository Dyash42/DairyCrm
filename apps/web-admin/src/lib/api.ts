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

export function fetchCustomerDetail(id: string) {
  return apiFetch<CustomerPayload & {
    route: { id: string; name: string } | null;
    subscriptions: Array<{ id: string; sku: string; litresPerDay: string; ratePerLitre: string; startDate: string; endDate: string | null; status: string }>;
    payments: Array<{ id: string; amount: string; mode: string; status: string; paidAt: string | null; createdAt: string }>;
    pauses: Array<{ id: string; startDate: string; endDate: string; resumeDate: string; reason: string | null }>;
  }>(`/customers/${id}/detail`);
}

export function fetchCustomerQr(id: string) {
  return apiFetch<{ code: string; dataUrl: string }>(`/customers/${id}/qr`);
}

export function regenerateCustomerQr(id: string, reason?: string) {
  return apiFetch<{ ok: true; qr: { id: string; version: number; url: string } }>(
    `/customers/${id}/qr/regenerate`,
    { method: 'POST', body: { reason } },
  );
}

export function fetchCustomerByCode(code: string) {
  return apiFetch<{
    id: string;
    code: string;
    name: string;
    addressLine1: string;
    litresPerDay: string;
    routeId: string | null;
    status: string;
  }>(`/customers/by-code/${encodeURIComponent(code)}`);
}

export function fetchExecutives() {
  return apiFetch<{
    executives: Array<{
      id: string;
      name: string;
      phone: string;
      email: string | null;
      active: boolean;
      routeId: string | null;
      routeName: string | null;
    }>;
  }>('/executives');
}

export function fetchBroadcasts() {
  return apiFetch<{
    broadcasts: Array<{
      id: string;
      message: string;
      target: 'ALL' | 'ROUTES' | 'CUSTOMERS';
      status: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED';
      sentCount: number;
      deliveredCount: number;
      failedCount: number;
      scheduledFor: string | null;
      createdAt: string;
      routes: Array<{ routeId: string; route: { name: string } }>;
    }>;
  }>('/broadcasts');
}

export function createBroadcast(input: {
  message: string;
  target: 'ALL' | 'ROUTES' | 'CUSTOMERS';
  routeIds?: string[];
  scheduledFor?: string;
}) {
  return apiFetch<{ id: string }>('/broadcasts', { method: 'POST', body: input });
}

export function sendBroadcast(id: string) {
  return apiFetch<{ id: string; status: string }>(`/broadcasts/${id}/send`, { method: 'POST' });
}

export function fetchInvoices(period?: string) {
  const q = period ? `?period=${period}` : '';
  return apiFetch<{
    period: string;
    invoices: Array<{
      id: string;
      customerName: string;
      customerCode: string;
      routeName: string;
      period: string;
      litres: number;
      amount: number;
      paid: boolean;
      paidVia: string | null;
    }>;
    totals: { billed: number; collected: number; outstanding: number };
  }>(`/billing/invoices${q}`);
}

export interface SettingRow {
  key: string;
  group: string;
  label: string;
  description?: string;
  type: 'STRING' | 'NUMBER' | 'BOOLEAN' | 'JSON';
  value: unknown;
  isDefault: boolean;
  editable?: boolean;
}

export function fetchSettings() {
  return apiFetch<{ groups: Record<string, SettingRow[]> }>('/settings');
}

export function updateSetting(key: string, value: unknown) {
  return apiFetch<{ ok: true; key: string; value: unknown }>(
    `/settings/${encodeURIComponent(key)}`,
    { method: 'PUT', body: { value } },
  );
}

export function fetchHolidays() {
  return apiFetch<{
    holidays: Array<{ id: string; date: string; reason: string; scope: string }>;
  }>('/settings/holidays');
}

// ----------------------- Products -----------------------
export interface ProductRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: 'MILK' | 'CURD' | 'GHEE' | 'BUTTER' | 'PANEER' | 'OTHER';
  ratePerUnit: string | number;
  unit: string;
  active: boolean;
  imageUrl: string | null;
  sortOrder: number;
}

export function fetchProducts() {
  return apiFetch<{ products: ProductRow[] }>('/products');
}

export function createProduct(input: {
  code: string;
  name: string;
  description?: string;
  category: ProductRow['category'];
  ratePerUnit: number;
  unit: string;
  active?: boolean;
  sortOrder?: number;
}) {
  return apiFetch<ProductRow>('/products', { method: 'POST', body: input });
}

export function updateProduct(id: string, input: Partial<Parameters<typeof createProduct>[0]>) {
  return apiFetch<ProductRow>(`/products/${id}`, { method: 'PATCH', body: input });
}

export function deleteProduct(id: string) {
  return apiFetch<{ ok: true }>(`/products/${id}`, { method: 'DELETE' });
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
