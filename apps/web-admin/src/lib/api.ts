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

export function fetchRouteDetail(id: string) {
  return apiFetch<{
    id: string;
    name: string;
    area: string;
    pinCodes: string[];
    executive: { id: string; user: { name: string; phone: string } } | null;
    customers: Array<{
      id: string;
      code: string;
      name: string;
      addressLine1: string;
      routeSeq: number | null;
      status: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
      litresPerDay: string | number;
    }>;
  }>(`/routes/${id}`);
}

export function fetchCustomers(params: {
  q?: string;
  status?: string;
  area?: string;
  limit?: number;
} = {}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.status) qs.set('status', params.status);
  if (params.area) qs.set('area', params.area);
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

export function fetchExecutiveDetail(id: string) {
  return apiFetch<{
    id: string;
    userId: string;
    routeId: string | null;
    user: { id: string; name: string; phone: string; email: string | null; active: boolean };
    route: { id: string; name: string; area: string; pinCodes: string[] } | null;
  }>(`/executives/${id}`);
}

export function createExecutive(input: {
  name: string;
  phone: string;
  email?: string;
  routeId?: string;
}) {
  return apiFetch<{ id: string }>('/executives', {
    method: 'POST',
    body: input,
  });
}

export function updateExecutive(
  id: string,
  input: Partial<{ name: string; phone: string; email: string | null; routeId: string | null; active: boolean }>,
) {
  return apiFetch<{ id: string }>(`/executives/${id}`, {
    method: 'PATCH',
    body: input,
  });
}

export function deactivateExecutive(id: string) {
  return apiFetch<{ ok: true }>(`/executives/${id}`, { method: 'DELETE' });
}

// ----------------------- Routes (CRUD) -----------------------
export function createRoute(input: {
  name: string;
  area: string;
  pinCodes: string[];
}) {
  return apiFetch<{ id: string }>('/routes', { method: 'POST', body: input });
}

export function assignRouteExecutive(routeId: string, executiveId: string | null) {
  return apiFetch<{ id: string }>(`/routes/${routeId}/executive`, {
    method: 'POST',
    body: { executiveId },
  });
}

// ----------------------- Subscriptions -----------------------
export interface SubscriptionRow {
  id: string;
  customerId: string;
  sku: string;
  productId: string | null;
  litresPerDay: string | number;
  daysOfWeek: number[];
  ratePerLitre: string | number;
  startDate: string;
  endDate: string;
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
}

export function pauseSubscription(id: string, body: { startDate: string; endDate: string; reason?: string }) {
  return apiFetch<{ id: string }>(`/subscriptions/${id}/pause`, {
    method: 'POST',
    body,
  });
}

export function resumeSubscription(id: string) {
  return apiFetch<{ ok: true }>(`/subscriptions/${id}/resume`, { method: 'POST' });
}

export function cancelSubscription(id: string) {
  return apiFetch<{ ok: true }>(`/subscriptions/${id}/cancel`, { method: 'POST' });
}

// ----------------------- Payments -----------------------
/**
 * Mirrors the backend `PaymentMode` enum exactly.
 * Don't add UI-only modes here — add them to the Prisma enum first.
 */
export type PaymentMode = 'CASH' | 'UPI_STATIC' | 'UPI_ONLINE' | 'CARD' | 'OTHER';

export const PAYMENT_MODE_LABEL: Record<PaymentMode, string> = {
  CASH: 'Cash',
  UPI_STATIC: 'UPI (QR)',
  UPI_ONLINE: 'UPI (online)',
  CARD: 'Card',
  OTHER: 'Other',
};

export interface PaymentRow {
  id: string;
  customerId: string;
  amount: string | number;
  mode: PaymentMode;
  status: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED';
  reference: string | null;
  paidAt: string | null;
  createdAt: string;
}

export function fetchPayments(params: { customerId?: string; limit?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.customerId) qs.set('customerId', params.customerId);
  if (params.limit) qs.set('limit', String(params.limit));
  const q = qs.toString();
  return apiFetch<{ payments: PaymentRow[] }>(`/payments${q ? `?${q}` : ''}`);
}

export function recordCashPayment(input: {
  customerId: string;
  amount: number;
  mode: PaymentMode;
  reference?: string;
  paidAt?: string;
}) {
  return apiFetch<PaymentRow>('/payments', { method: 'POST', body: input });
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

// ---------- Bot prompts ----------

export type BotPromptKind = 'text' | 'buttons' | 'list';

export interface BotPromptButton {
  id: string;
  title: string;
}

export interface BotPromptRow {
  id: string;
  title: string;
  description?: string;
}

export interface BotPromptRecord {
  key: string;
  flow: string;
  label: string;
  kind: BotPromptKind;
  body: string;
  buttons: BotPromptButton[] | null;
  rows: BotPromptRow[] | null;
  variables: string[];
  sortOrder: number;
  notes: string | null;
  updatedAt: string;
  updatedBy: string | null;
}

export function fetchBotPrompts() {
  return apiFetch<{ prompts: BotPromptRecord[] }>('/bot-prompts');
}

export function updateBotPrompt(
  key: string,
  patch: {
    body?: string;
    buttons?: BotPromptButton[];
    rows?: BotPromptRow[];
    notes?: string | null;
  },
) {
  return apiFetch<BotPromptRecord>(`/bot-prompts/${encodeURIComponent(key)}`, {
    method: 'PATCH',
    body: patch,
  });
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

export interface AuditEvent {
  ts: string;
  kind: 'QR_REVOKED' | 'DELIVERY_SCANNED' | 'DELIVERY_MISSED';
  customer: { id: string; name: string; code: string };
  actor: string | null;
  detail: string;
}

export function fetchAuditLog(limit = 100) {
  return apiFetch<{ events: AuditEvent[] }>(`/settings/audit?limit=${limit}`);
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

// ----------------------- Bulk import -----------------------
export interface BulkValidatedRow {
  row: number;
  name: string;
  phone: string;
  addressLine1: string;
  area?: string;
  pinCode?: string;
  routeName: string;
  productCode: string;
  litresPerDay: number;
  daysOfWeek: number[];
  durationDays: number;
  startDate: string;
  customerCode?: string;
}

export interface BulkValidationIssue {
  row: number;
  column?: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface BulkValidationResult {
  valid: BulkValidatedRow[];
  issues: BulkValidationIssue[];
  summary: {
    rowsSubmitted: number;
    rowsValid: number;
    errorCount: number;
    warningCount: number;
  };
}

/** Server-side validate of pasted CSV. */
export function bulkValidate(csv: string) {
  return apiFetch<BulkValidationResult>('/customers/bulk/validate', {
    method: 'POST',
    body: { csv },
  });
}

export function bulkCommit(rows: BulkValidatedRow[]) {
  return apiFetch<{ imported: number; failures: Array<{ row: number; error: string }> }>(
    '/customers/bulk/commit',
    { method: 'POST', body: { rows } },
  );
}

/**
 * The template endpoint is auth-required — so we can't use a plain
 * <a href>. This fetches with the Bearer token then triggers a browser
 * download via an object URL, matching the Customers CSV export pattern.
 */
export async function downloadBulkTemplate(): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/customers/bulk/template`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, `Template download failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'jharanai-customer-template.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** @deprecated use downloadBulkTemplate() — a plain href returns 401 since the endpoint is authed. */
export function bulkTemplateUrl(): string {
  return `${API_BASE}/customers/bulk/template`;
}

// ----------------------- WhatsApp bot tester -----------------------
/**
 * The shapes here mirror the backend's `OutboundAction` discriminated
 * union (apps/backend/src/whatsapp/types.ts). The admin chat UI uses
 * `kind` to pick how to render each bot reply.
 */
export type BotOutbound =
  | { kind: 'text'; to: string; body: string }
  | {
      kind: 'template';
      to: string;
      templateName: string;
      variables?: Record<string, string>;
      mediaUrl?: string;
    }
  | {
      kind: 'buttons';
      to: string;
      body: string;
      buttons: Array<{ id: string; title: string }>;
    }
  | {
      kind: 'list';
      to: string;
      body: string;
      buttonText: string;
      sections: Array<{
        title: string;
        rows: Array<{ id: string; title: string; description?: string }>;
      }>;
    }
  | { kind: 'image'; to: string; mediaUrl: string; caption?: string };

export interface BotSendResult {
  outbound: BotOutbound[];
  state: {
    flow: string | null;
    step: string | null;
    customerId: string | null;
  } | null;
}

export function botSend(
  body:
    | { kind: 'text'; from: string; text: string }
    | { kind: 'button'; from: string; payload: string; title: string }
    | { kind: 'list'; from: string; rowId: string; title: string },
) {
  return apiFetch<BotSendResult>('/whatsapp/test/send', {
    method: 'POST',
    body,
  });
}

export function botReset(from: string) {
  return apiFetch<{ ok: true; from: string }>('/whatsapp/test/reset', {
    method: 'POST',
    body: { from },
  });
}

// ----------------------- Admin observability log -----------------------
/**
 * Fire-and-forget log of a client-side event to the backend. Surfaces
 * page navigations + errors in the backend log file (server.log) so a
 * developer (or future agent) can read ONE timestamped feed to debug.
 *
 * NEVER throws — log capture must never break the UI. A 401, network
 * timeout, or rate-limit is swallowed silently.
 */
export function logAdminEvent(
  kind: 'page-view' | 'page-error' | 'page-info',
  path: string,
  opts: { message?: string; meta?: Record<string, unknown> } = {},
): void {
  // No-op when not logged in — backend rejects unauthenticated logs.
  if (!getToken()) return;
  // Use sendBeacon when available (survives page unload) — but it
  // doesn't carry the Authorization header. Fall back to fetch().
  void apiFetch('/admin-log/event', {
    method: 'POST',
    body: { kind, path, ...opts },
  }).catch(() => {
    // intentionally ignored
  });
}

/** Download all customers as a CSV — opens in browser with token in URL.
 *  Since the endpoint is authed, we fetch then make an object URL. */
export async function downloadCustomersCsv(filename = 'customers.csv'): Promise<void> {
  const token = getToken();
  const res = await fetch(`${API_BASE}/customers/export.csv`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, `Export failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Create a single customer (used by the Add Customer modal). */
export function createCustomer(input: {
  name: string;
  phone: string;
  addressLine1: string;
  email?: string;
  altPhone?: string;
  area?: string;
  pinCode?: string;
  routeId?: string;
  litresPerDay: number;
}) {
  return apiFetch<{ id: string; code: string; qrCodeUrl: string }>(
    '/customers',
    { method: 'POST', body: input },
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
