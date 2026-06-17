import { DeliveryStatus, DeliveryStop } from '@/models/delivery';
import { api } from './client';

function toNum(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const n = Number.parseFloat(v);
    return Number.isNaN(n) ? 0 : n;
  }
  return 0;
}

function parseStatus(s: string): DeliveryStatus {
  switch (s.toUpperCase()) {
    case 'DELIVERED':
      return 'delivered';
    case 'PARTIAL':
      return 'partial';
    case 'SKIPPED':
      return 'skipped';
    default:
      return 'pending';
  }
}

export interface TodaysRoute {
  date: string;
  routeId: string | null;
  stops: DeliveryStop[];
}

export interface EndOfDayReport {
  date: string;
  delivered: number;
  partial: number;
  skipped: number;
  pending: number;
  litresScheduled: number;
  litresDelivered: number;
  cashCollected: number;
  cashReported: number | null;
  cashVariance: number | null;
}

export interface CustomerByCode {
  id: string;
  code: string;
  name: string;
  addressLine1: string;
  litresPerDay: number;
}

export const deliveryApi = {
  /** Today's route for the logged-in executive. */
  async todaysRoute(): Promise<TodaysRoute> {
    const res = await api.get('/deliveries/today');
    const data = res.data as Record<string, unknown>;
    const list = (data.deliveries as Record<string, unknown>[]) ?? [];
    const stops = list.map((d, i) => {
      const customer = (d.customer ?? {}) as Record<string, unknown>;
      return new DeliveryStop({
        id: String(d.id),
        customerCode: customer.code != null ? String(customer.code) : '',
        customerName: customer.name != null ? String(customer.name) : 'Customer',
        houseNumber: customer.routeSeq != null ? String(customer.routeSeq) : '',
        addressLine:
          customer.addressLine1 != null ? String(customer.addressLine1) : '',
        scheduledLitres: toNum(d.scheduledLitres),
        deliveredLitres:
          d.deliveredLitres == null ? null : toNum(d.deliveredLitres),
        sequence: i + 1,
        status: parseStatus(d.status != null ? String(d.status) : 'PENDING'),
        scannedAt: d.scannedAt == null ? null : new Date(String(d.scannedAt)),
        customerId: customer.id != null ? String(customer.id) : '',
        lat: customer.lat == null ? null : toNum(customer.lat),
        lng: customer.lng == null ? null : toNum(customer.lng),
      });
    });
    return {
      date: data.date != null ? String(data.date) : '',
      routeId: data.routeId != null ? String(data.routeId) : null,
      stops,
    };
  },

  /** Confirm a delivery (full or partial qty). */
  async confirm(params: {
    deliveryId: string;
    deliveredLitres: number;
    cashCollected?: number | null;
    note?: string | null;
  }): Promise<void> {
    const body: Record<string, unknown> = {
      deliveredLitres: params.deliveredLitres,
    };
    if (params.cashCollected != null) body.cashCollected = params.cashCollected;
    if (params.note) body.note = params.note;
    await api.post(`/deliveries/${params.deliveryId}/confirm`, body);
  },

  /** Skip — customer not home, etc. */
  async skip(params: { deliveryId: string; reason?: string | null }): Promise<void> {
    const body: Record<string, unknown> = {};
    if (params.reason) body.reason = params.reason;
    await api.post(`/deliveries/${params.deliveryId}/skip`, body);
  },

  /**
   * Submit the end-of-day report. The backend computes the authoritative
   * totals from confirmed deliveries + payments; the milkman's tally is for
   * variance reporting plus optional notes.
   */
  async submitEndOfDay(params: {
    reportedCashTotal?: number;
    notes?: string;
  }): Promise<EndOfDayReport> {
    const body: Record<string, unknown> = {};
    if (params.reportedCashTotal != null)
      body.reportedCashTotal = params.reportedCashTotal;
    if (params.notes) body.notes = params.notes;
    const res = await api.post('/deliveries/end-of-day', body);
    const data = res.data as Record<string, unknown>;
    const counts = (data.counts ?? {}) as Record<string, unknown>;
    const litres = (data.litres ?? {}) as Record<string, unknown>;
    const cash = (data.cash ?? {}) as Record<string, unknown>;
    return {
      date: data.date != null ? String(data.date) : '',
      delivered: Math.trunc(toNum(counts.delivered)),
      partial: Math.trunc(toNum(counts.partial)),
      skipped: Math.trunc(toNum(counts.skipped)),
      pending: Math.trunc(toNum(counts.pending)),
      litresScheduled: toNum(litres.scheduled),
      litresDelivered: toNum(litres.delivered),
      cashCollected: toNum(cash.collected),
      cashReported: cash.reported == null ? null : toNum(cash.reported),
      cashVariance: cash.variance == null ? null : toNum(cash.variance),
    };
  },

  /** Resolve a scanned QR payload (`JHR-XXXXXX`) -> customer summary. */
  async lookupByCode(code: string): Promise<CustomerByCode> {
    const res = await api.get(`/customers/by-code/${encodeURIComponent(code)}`);
    const data = res.data as Record<string, unknown>;
    return {
      id: String(data.id),
      code: String(data.code),
      name: String(data.name),
      addressLine1: data.addressLine1 != null ? String(data.addressLine1) : '',
      litresPerDay: toNum(data.litresPerDay),
    };
  },

  /** Save a customer's door pin (captured at the door by the delivery partner). */
  async saveCustomerLocation(customerId: string, lat: number, lng: number): Promise<void> {
    await api.post(`/customers/${customerId}/location`, { lat, lng });
  },
};
