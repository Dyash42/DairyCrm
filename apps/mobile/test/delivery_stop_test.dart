/// Unit tests for DeliveryStop + RouteSummary — the pure Dart core of the
/// app's domain model. These exercise the completion math the route header
/// reads to drive its big counter.
///
/// Run with:  cd apps/mobile && flutter test

import 'package:flutter_test/flutter_test.dart';
import 'package:jharanai_mobile/models/delivery_stop.dart';

DeliveryStop stop({
  String id = 's1',
  String name = 'Test',
  String code = 'JHR-100001',
  double scheduled = 2.0,
  double? delivered,
  DeliveryStatus status = DeliveryStatus.pending,
  int seq = 1,
}) {
  return DeliveryStop(
    id: id,
    customerCode: code,
    customerName: name,
    houseNumber: 'Plot $seq',
    addressLine: 'Some lane',
    scheduledLitres: scheduled,
    deliveredLitres: delivered,
    status: status,
    sequence: seq,
  );
}

void main() {
  group('DeliveryStop status helpers', () {
    test('isPending true for fresh stop', () {
      expect(stop().isPending, isTrue);
      expect(stop().isDelivered, isFalse);
      expect(stop().isSkipped, isFalse);
    });

    test('isDelivered true for delivered + partial', () {
      expect(stop(status: DeliveryStatus.delivered).isDelivered, isTrue);
      expect(stop(status: DeliveryStatus.partial).isDelivered, isTrue);
    });

    test('isPartial requires delivered < scheduled', () {
      expect(
        stop(
          status: DeliveryStatus.partial,
          scheduled: 2.0,
          delivered: 1.0,
        ).isPartial,
        isTrue,
      );
      // Same litres → not partial
      expect(
        stop(
          status: DeliveryStatus.partial,
          scheduled: 2.0,
          delivered: 2.0,
        ).isPartial,
        isFalse,
      );
    });

    test('copyWith preserves identity fields', () {
      final s = stop(id: 'abc', name: 'Anita', code: 'JHR-100390');
      final updated = s.copyWith(
        status: DeliveryStatus.delivered,
        deliveredLitres: 2.0,
      );
      expect(updated.id, 'abc');
      expect(updated.customerName, 'Anita');
      expect(updated.customerCode, 'JHR-100390');
      expect(updated.status, DeliveryStatus.delivered);
      expect(updated.deliveredLitres, 2.0);
    });
  });

  group('RouteSummary completion math', () {
    RouteSummary withStops(List<DeliveryStop> s) => RouteSummary(
          executiveName: 'Milkman',
          dateLabel: 'Sun 7 Jun',
          routeLabel: 'Route 4',
          stops: s,
        );

    test('empty route is 100% complete', () {
      final r = withStops([]);
      expect(r.completionPct, 100);
      expect(r.isComplete, isTrue);
      expect(r.litresScheduledTotal, 0);
    });

    test('all pending → 0%', () {
      final r = withStops([
        stop(id: '1'),
        stop(id: '2'),
        stop(id: '3'),
      ]);
      expect(r.completionPct, 0);
      expect(r.isComplete, isFalse);
      expect(r.pendingCount, 3);
    });

    test('half delivered → ~50%', () {
      final r = withStops([
        stop(id: '1', status: DeliveryStatus.delivered, delivered: 2.0),
        stop(id: '2', status: DeliveryStatus.delivered, delivered: 2.0),
        stop(id: '3'),
        stop(id: '4'),
      ]);
      expect(r.completionPct, 50);
      expect(r.servedCount, 2);
      expect(r.pendingCount, 2);
    });

    test('skipped stops are excluded from the completion denominator', () {
      // 1 delivered, 1 skipped, 0 pending → 1/1 = 100%
      final r = withStops([
        stop(id: '1', status: DeliveryStatus.delivered, delivered: 2.0),
        stop(id: '2', status: DeliveryStatus.skipped),
      ]);
      expect(r.completionPct, 100);
      expect(r.skippedCount, 1);
      expect(r.isComplete, isTrue);
    });

    test('litresDeliveredTotal counts partial actuals', () {
      final r = withStops([
        stop(id: '1', status: DeliveryStatus.delivered, scheduled: 2.0),
        stop(id: '2', status: DeliveryStatus.partial, scheduled: 2.0, delivered: 1.5),
        stop(id: '3'),
        stop(id: '4', status: DeliveryStatus.skipped),
      ]);
      // delivered: full 2.0 + partial 1.5 = 3.5
      expect(r.litresDeliveredTotal, 3.5);
      expect(r.litresScheduledTotal, 8.0);
    });

    test('litresLeft skips delivered + skipped, sums pending scheduled', () {
      final r = withStops([
        stop(id: '1', status: DeliveryStatus.delivered, scheduled: 2.0),
        stop(id: '2', status: DeliveryStatus.skipped, scheduled: 1.5),
        stop(id: '3', scheduled: 1.0),
        stop(id: '4', scheduled: 2.0),
      ]);
      expect(r.litresLeft, 3.0); // only stops 3 + 4 still owed
    });
  });
}
