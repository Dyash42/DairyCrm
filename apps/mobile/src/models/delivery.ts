/**
 * One customer stop on the milkman's route today, plus the day's route
 * summary. Port of the Flutter app's models/delivery_stop.dart. Mirrors the
 * Delivery entity on the backend (apps/backend/prisma/schema.prisma).
 */
import { RATE_PER_LITRE_INR } from '@/theme/tokens';

export type DeliveryStatus = 'pending' | 'delivered' | 'partial' | 'skipped';

export interface DeliveryStopInit {
  id: string;
  customerCode: string;
  customerName: string;
  houseNumber: string;
  addressLine: string;
  scheduledLitres: number;
  sequence: number;
  deliveredLitres?: number | null;
  status?: DeliveryStatus;
  scannedAt?: Date | null;
  customerId?: string;
  lat?: number | null;
  lng?: number | null;
}

export class DeliveryStop {
  readonly id: string;
  readonly customerCode: string; // e.g. JHR-100455
  readonly customerName: string;
  readonly houseNumber: string; // e.g. MIG-12, Plot 4
  readonly addressLine: string;
  readonly scheduledLitres: number;
  readonly deliveredLitres: number | null;
  readonly sequence: number; // 1, 2, 3 ...
  readonly status: DeliveryStatus;
  readonly scannedAt: Date | null;
  readonly customerId: string; // backend Customer.id (for saving the door pin)
  readonly lat: number | null;
  readonly lng: number | null;

  constructor(init: DeliveryStopInit) {
    this.id = init.id;
    this.customerCode = init.customerCode;
    this.customerName = init.customerName;
    this.houseNumber = init.houseNumber;
    this.addressLine = init.addressLine;
    this.scheduledLitres = init.scheduledLitres;
    this.deliveredLitres = init.deliveredLitres ?? null;
    this.sequence = init.sequence;
    this.status = init.status ?? 'pending';
    this.scannedAt = init.scannedAt ?? null;
    this.customerId = init.customerId ?? '';
    this.lat = init.lat ?? null;
    this.lng = init.lng ?? null;
  }

  get isDelivered(): boolean {
    return this.status === 'delivered' || this.status === 'partial';
  }

  get isPartial(): boolean {
    return (
      this.status === 'partial' &&
      this.deliveredLitres != null &&
      this.deliveredLitres < this.scheduledLitres
    );
  }

  get isPending(): boolean {
    return this.status === 'pending';
  }

  get isSkipped(): boolean {
    return this.status === 'skipped';
  }

  copyWith(patch: {
    status?: DeliveryStatus;
    deliveredLitres?: number | null;
    scannedAt?: Date | null;
  }): DeliveryStop {
    return new DeliveryStop({
      id: this.id,
      customerCode: this.customerCode,
      customerName: this.customerName,
      houseNumber: this.houseNumber,
      addressLine: this.addressLine,
      scheduledLitres: this.scheduledLitres,
      deliveredLitres:
        patch.deliveredLitres !== undefined
          ? patch.deliveredLitres
          : this.deliveredLitres,
      sequence: this.sequence,
      status: patch.status ?? this.status,
      scannedAt: patch.scannedAt !== undefined ? patch.scannedAt : this.scannedAt,
      customerId: this.customerId,
      lat: this.lat,
      lng: this.lng,
    });
  }
}

export class RouteSummary {
  readonly executiveName: string;
  readonly dateLabel: string; // "Mon 2 Jun"
  readonly routeLabel: string; // "Route 4 — Berhampur South"
  readonly stops: DeliveryStop[];

  constructor(init: {
    executiveName: string;
    dateLabel: string;
    routeLabel: string;
    stops: DeliveryStop[];
  }) {
    this.executiveName = init.executiveName;
    this.dateLabel = init.dateLabel;
    this.routeLabel = init.routeLabel;
    this.stops = init.stops;
  }

  get totalCustomers(): number {
    return this.stops.length;
  }

  get servedCount(): number {
    return this.stops.filter((s) => s.isDelivered).length;
  }

  get pendingCount(): number {
    return this.stops.filter((s) => s.isPending).length;
  }

  get skippedCount(): number {
    return this.stops.filter((s) => s.isSkipped).length;
  }

  get litresScheduledTotal(): number {
    return this.stops.reduce((a, s) => a + s.scheduledLitres, 0);
  }

  get litresDeliveredTotal(): number {
    return this.stops.reduce((a, s) => {
      if (!s.isDelivered) return a;
      return a + (s.deliveredLitres ?? s.scheduledLitres);
    }, 0);
  }

  /** Litres still owed today (scheduled - delivered, ignoring skipped). */
  get litresLeft(): number {
    let remaining = 0;
    for (const s of this.stops) {
      if (s.isSkipped) continue;
      if (s.isDelivered) continue;
      remaining += s.scheduledLitres;
    }
    return remaining;
  }

  /** Completion % across non-skipped stops. */
  get completionPct(): number {
    const actionable = this.stops.filter((s) => !s.isSkipped).length;
    if (actionable === 0) return 100;
    const done = this.stops.filter((s) => s.isDelivered).length;
    return Math.round((done / actionable) * 100);
  }

  get isComplete(): boolean {
    return this.pendingCount === 0;
  }

  /** Approx amount to collect — uses the display rate fallback. In production
   *  this comes from the backend (per-customer rate × delivered). */
  get amountToCollect(): number {
    return Math.round(this.litresDeliveredTotal * RATE_PER_LITRE_INR);
  }
}

export function emptySummary(): RouteSummary {
  return new RouteSummary({
    executiveName: '',
    dateLabel: '',
    routeLabel: '',
    stops: [],
  });
}
