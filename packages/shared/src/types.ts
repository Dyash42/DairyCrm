/**
 * Shared domain types — used by backend, web-admin, and (mirrored) by mobile.
 * Keep this file free of framework dependencies.
 */

// ---------- IDs ----------
export type CustomerId = string;
export type RouteId = string;
export type ExecutiveId = string;
export type SubscriptionId = string;
export type DeliveryId = string;
export type BroadcastId = string;

// ---------- Customer ----------
// 'PENDING' = an onboarding lead not yet paid (audit ARC-08); promoted to
// ACTIVE on payment. Distinct from PAUSED/CANCELLED.
export type CustomerStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'PENDING';

export interface Customer {
  id: CustomerId;
  code: string; // human-readable e.g. JHR-100455
  name: string;
  phone: string;
  altPhone?: string;
  email?: string;
  addressLine1: string;
  addressLine2?: string;
  area?: string;
  pinCode?: string;
  routeId?: RouteId;
  status: CustomerStatus;
  litresPerDay: number;
  balance: number; // negative = customer owes; positive = credit
  qrCodeUrl?: string;
  createdAt: string;
  updatedAt: string;
}

// ---------- Route ----------
export interface Route {
  id: RouteId;
  name: string; // "Route 1"
  area: string; // "Berhampur North"
  pinCodes: string[];
  executiveId?: ExecutiveId;
  customerCount: number;
  todayCompletion?: number; // 0–100
}

// ---------- Executive (Milkman) ----------
export interface Executive {
  id: ExecutiveId;
  name: string;
  phone: string;
  routeId?: RouteId;
  active: boolean;
}

// ---------- Subscription ----------
export type SubscriptionStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED';

export interface Subscription {
  id: SubscriptionId;
  customerId: CustomerId;
  sku: string; // e.g. "COW_MILK"
  litresPerDay: number;
  daysOfWeek: number[]; // 0=Sun … 6=Sat
  ratePerLitre: number;
  startDate: string;
  endDate?: string;
  status: SubscriptionStatus;
}

// ---------- Delivery ----------
export type DeliveryStatus = 'PENDING' | 'DELIVERED' | 'PARTIAL' | 'SKIPPED' | 'MISSED';

export interface Delivery {
  id: DeliveryId;
  customerId: CustomerId;
  routeId: RouteId;
  executiveId?: ExecutiveId;
  scheduledLitres: number;
  deliveredLitres?: number;
  status: DeliveryStatus;
  scheduledFor: string; // ISO date
  scannedAt?: string;
  note?: string;
}

// ---------- Broadcast ----------
export type BroadcastTarget = 'ALL' | 'ROUTES' | 'CUSTOMERS';

export interface Broadcast {
  id: BroadcastId;
  message: string;
  target: BroadcastTarget;
  routeIds?: RouteId[];
  customerIds?: CustomerId[];
  scheduledFor?: string;
  sentCount?: number;
  deliveredCount?: number;
  failedCount?: number;
  status: 'DRAFT' | 'SCHEDULED' | 'SENDING' | 'SENT' | 'FAILED';
  createdAt: string;
}

// ---------- Dashboard ----------
export interface DashboardMetrics {
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
  breakdown: {
    pending: number;
    missed: number;
    paused: number;
    newToday: number;
    /** Active customers with an active sub but no route — never delivered/billed
     *  until assigned (audit EDG-04/BAC-08). Optional for back-compat. */
    unroutedActive?: number;
  };
  byRoute: Array<{ routeName: string; litres: number; completionPct: number }>;
  subscriptions: { active: number; paused: number; cancelled: number; total: number };
}
