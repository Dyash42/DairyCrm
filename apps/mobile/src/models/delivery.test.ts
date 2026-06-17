/**
 * Unit tests for DeliveryStop + RouteSummary — the pure domain core that
 * drives the route header's completion math. Ported 1:1 from the Flutter
 * app's test/delivery_stop_test.dart.
 */
import { DeliveryStatus, DeliveryStop, RouteSummary } from './delivery';

function stop(opts: {
  id?: string;
  name?: string;
  code?: string;
  scheduled?: number;
  delivered?: number | null;
  status?: DeliveryStatus;
  seq?: number;
} = {}): DeliveryStop {
  const seq = opts.seq ?? 1;
  return new DeliveryStop({
    id: opts.id ?? 's1',
    customerCode: opts.code ?? 'JHR-100001',
    customerName: opts.name ?? 'Test',
    houseNumber: `Plot ${seq}`,
    addressLine: 'Some lane',
    scheduledLitres: opts.scheduled ?? 2.0,
    deliveredLitres: opts.delivered ?? null,
    status: opts.status ?? 'pending',
    sequence: seq,
  });
}

function withStops(stops: DeliveryStop[]): RouteSummary {
  return new RouteSummary({
    executiveName: 'Milkman',
    dateLabel: 'Sun 7 Jun',
    routeLabel: 'Route 4',
    stops,
  });
}

describe('DeliveryStop status helpers', () => {
  test('isPending true for fresh stop', () => {
    expect(stop().isPending).toBe(true);
    expect(stop().isDelivered).toBe(false);
    expect(stop().isSkipped).toBe(false);
  });

  test('isDelivered true for delivered + partial', () => {
    expect(stop({ status: 'delivered' }).isDelivered).toBe(true);
    expect(stop({ status: 'partial' }).isDelivered).toBe(true);
  });

  test('isPartial requires delivered < scheduled', () => {
    expect(stop({ status: 'partial', scheduled: 2.0, delivered: 1.0 }).isPartial).toBe(true);
    expect(stop({ status: 'partial', scheduled: 2.0, delivered: 2.0 }).isPartial).toBe(false);
  });

  test('copyWith preserves identity fields', () => {
    const s = stop({ id: 'abc', name: 'Anita', code: 'JHR-100390' });
    const updated = s.copyWith({ status: 'delivered', deliveredLitres: 2.0 });
    expect(updated.id).toBe('abc');
    expect(updated.customerName).toBe('Anita');
    expect(updated.customerCode).toBe('JHR-100390');
    expect(updated.status).toBe('delivered');
    expect(updated.deliveredLitres).toBe(2.0);
  });
});

describe('RouteSummary completion math', () => {
  test('empty route is 100% complete', () => {
    const r = withStops([]);
    expect(r.completionPct).toBe(100);
    expect(r.isComplete).toBe(true);
    expect(r.litresScheduledTotal).toBe(0);
  });

  test('all pending -> 0%', () => {
    const r = withStops([stop({ id: '1' }), stop({ id: '2' }), stop({ id: '3' })]);
    expect(r.completionPct).toBe(0);
    expect(r.isComplete).toBe(false);
    expect(r.pendingCount).toBe(3);
  });

  test('half delivered -> ~50%', () => {
    const r = withStops([
      stop({ id: '1', status: 'delivered', delivered: 2.0 }),
      stop({ id: '2', status: 'delivered', delivered: 2.0 }),
      stop({ id: '3' }),
      stop({ id: '4' }),
    ]);
    expect(r.completionPct).toBe(50);
    expect(r.servedCount).toBe(2);
    expect(r.pendingCount).toBe(2);
  });

  test('skipped stops are excluded from the completion denominator', () => {
    const r = withStops([
      stop({ id: '1', status: 'delivered', delivered: 2.0 }),
      stop({ id: '2', status: 'skipped' }),
    ]);
    expect(r.completionPct).toBe(100);
    expect(r.skippedCount).toBe(1);
    expect(r.isComplete).toBe(true);
  });

  test('litresDeliveredTotal counts partial actuals', () => {
    const r = withStops([
      stop({ id: '1', status: 'delivered', scheduled: 2.0 }),
      stop({ id: '2', status: 'partial', scheduled: 2.0, delivered: 1.5 }),
      stop({ id: '3' }),
      stop({ id: '4', status: 'skipped' }),
    ]);
    expect(r.litresDeliveredTotal).toBe(3.5);
    expect(r.litresScheduledTotal).toBe(8.0);
  });

  test('litresLeft skips delivered + skipped, sums pending scheduled', () => {
    const r = withStops([
      stop({ id: '1', status: 'delivered', scheduled: 2.0 }),
      stop({ id: '2', status: 'skipped', scheduled: 1.5 }),
      stop({ id: '3', scheduled: 1.0 }),
      stop({ id: '4', scheduled: 2.0 }),
    ]);
    expect(r.litresLeft).toBe(3.0);
  });
});
