import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../models/delivery_stop.dart';

/// Demo modes — flip via the dev menu to render each state from the PDF.
/// In production this is replaced by a real backend feed + local SQLite.
enum DemoMode { defaultMorning, midRoute, routeComplete, offline }

final demoModeProvider = StateProvider<DemoMode>((ref) => DemoMode.defaultMorning);

/// Whether the app is in offline mode (banner + queue counter).
final isOfflineProvider = Provider<bool>((ref) {
  return ref.watch(demoModeProvider) == DemoMode.offline;
});

/// Mock queued-scan count shown in the offline banner.
final queuedScanCountProvider = StateProvider<int>((ref) {
  return ref.watch(demoModeProvider) == DemoMode.offline ? 3 : 0;
});

/// The route the milkman is on today.
final routeSummaryProvider = StateNotifierProvider<RouteNotifier, RouteSummary>(
  (ref) {
    final mode = ref.watch(demoModeProvider);
    return RouteNotifier(_buildForMode(mode));
  },
);

class RouteNotifier extends StateNotifier<RouteSummary> {
  RouteNotifier(super.initial);

  void markDelivered(String stopId, double deliveredLitres) {
    final stops = state.stops.map((s) {
      if (s.id != stopId) return s;
      final isPartial = deliveredLitres < s.scheduledLitres;
      return s.copyWith(
        status:
            isPartial ? DeliveryStatus.partial : DeliveryStatus.delivered,
        deliveredLitres: deliveredLitres,
        scannedAt: DateTime.now(),
      );
    }).toList();
    state = RouteSummary(
      executiveName: state.executiveName,
      dateLabel: state.dateLabel,
      routeLabel: state.routeLabel,
      stops: stops,
    );
  }

  void markSkipped(String stopId) {
    final stops = state.stops.map((s) {
      if (s.id != stopId) return s;
      return s.copyWith(status: DeliveryStatus.skipped);
    }).toList();
    state = RouteSummary(
      executiveName: state.executiveName,
      dateLabel: state.dateLabel,
      routeLabel: state.routeLabel,
      stops: stops,
    );
  }
}

RouteSummary _buildForMode(DemoMode mode) {
  switch (mode) {
    case DemoMode.defaultMorning:
      return _defaultMorning();
    case DemoMode.midRoute:
    case DemoMode.offline:
      return _midRoute();
    case DemoMode.routeComplete:
      return _routeComplete();
  }
}

// ---------------- demo data — mirrors the design PDF exactly ----------------

const _exec = 'Ramesh Sahu';
const _date = 'Mon 2 Jun';
const _routeLbl = 'Route 4 — Berhampur South';

List<DeliveryStop> _baseStops() => [
      const DeliveryStop(
        id: 's1',
        customerCode: 'JHR-100455',
        customerName: 'Sunil Pradhan',
        houseNumber: 'MIG-12',
        addressLine: 'Gandhi Nagar, 3rd Lane',
        scheduledLitres: 2.0,
        sequence: 1,
      ),
      const DeliveryStop(
        id: 's2',
        customerCode: 'JHR-100390',
        customerName: 'Anita Sahoo',
        houseNumber: 'Plot 4',
        addressLine: 'Sasibhushan Lane, Berhampur',
        scheduledLitres: 1.0,
        sequence: 2,
      ),
      const DeliveryStop(
        id: 's3',
        customerCode: 'JHR-100501',
        customerName: 'Bijay Patnaik',
        houseNumber: 'Flat 27',
        addressLine: 'Surya Vihar, Block C',
        scheduledLitres: 3.0,
        sequence: 3,
      ),
      const DeliveryStop(
        id: 's4',
        customerCode: 'JHR-100214',
        customerName: 'Lopamudra Das',
        houseNumber: 'House 8',
        addressLine: 'Aska Road, near Temple',
        scheduledLitres: 1.5,
        sequence: 4,
      ),
      const DeliveryStop(
        id: 's5',
        customerCode: 'JHR-100377',
        customerName: 'Rabindra Mohanty',
        houseNumber: 'MIG-15',
        addressLine: 'Gajapati Nagar, 2nd Cross',
        scheduledLitres: 2.0,
        sequence: 5,
      ),
      const DeliveryStop(
        id: 's6',
        customerCode: 'JHR-100620',
        customerName: 'Priyanka Behera',
        houseNumber: 'Plot 3',
        addressLine: 'Giri Market, Old Town',
        scheduledLitres: 1.0,
        sequence: 6,
      ),
      const DeliveryStop(
        id: 's7',
        customerCode: 'JHR-100118',
        customerName: 'Susanta Nayak',
        houseNumber: 'House 19',
        addressLine: 'Engineering School Road',
        scheduledLitres: 4.0,
        sequence: 7,
      ),
      const DeliveryStop(
        id: 's8',
        customerCode: 'JHR-100455b',
        customerName: 'Manoj Rout',
        houseNumber: 'Flat 22',
        addressLine: 'Komapalli, Sector 2',
        scheduledLitres: 1.5,
        sequence: 8,
      ),
      const DeliveryStop(
        id: 's9',
        customerCode: 'JHR-100712',
        customerName: 'Gayatri Panda',
        houseNumber: 'House 6',
        addressLine: 'Hill Patna, Upper Lane',
        scheduledLitres: 2.5,
        sequence: 9,
      ),
      const DeliveryStop(
        id: 's10',
        customerCode: 'JHR-100089',
        customerName: 'Debasish Sahu',
        houseNumber: 'MIG-31',
        addressLine: 'Ankuli, Main Road',
        scheduledLitres: 1.0,
        sequence: 10,
      ),
    ];

RouteSummary _defaultMorning() => RouteSummary(
      executiveName: _exec,
      dateLabel: _date,
      routeLabel: _routeLbl,
      stops: _baseStops(),
    );

RouteSummary _midRoute() {
  final stops = _baseStops();
  // 1-4 delivered, 3 was partial (2.0 of 3.0)
  stops[0] = stops[0].copyWith(
    status: DeliveryStatus.delivered,
    deliveredLitres: 2.0,
  );
  stops[1] = stops[1].copyWith(
    status: DeliveryStatus.delivered,
    deliveredLitres: 1.0,
  );
  stops[2] = stops[2].copyWith(
    status: DeliveryStatus.partial,
    deliveredLitres: 2.0, // was 3.0
  );
  stops[3] = stops[3].copyWith(
    status: DeliveryStatus.delivered,
    deliveredLitres: 1.5,
  );
  // 5 skipped (not home)
  stops[4] = stops[4].copyWith(status: DeliveryStatus.skipped);
  // 6, 7 delivered
  stops[5] = stops[5].copyWith(
    status: DeliveryStatus.delivered,
    deliveredLitres: 1.0,
  );
  stops[6] = stops[6].copyWith(
    status: DeliveryStatus.delivered,
    deliveredLitres: 4.0,
  );
  // 8, 9, 10 still pending
  return RouteSummary(
    executiveName: _exec,
    dateLabel: _date,
    routeLabel: _routeLbl,
    stops: stops,
  );
}

RouteSummary _routeComplete() {
  final stops = _midRoute().stops;
  // Complete remaining ones
  stops[7] = stops[7].copyWith(
    status: DeliveryStatus.delivered,
    deliveredLitres: 1.5,
  );
  stops[8] = stops[8].copyWith(
    status: DeliveryStatus.delivered,
    deliveredLitres: 2.5,
  );
  stops[9] = stops[9].copyWith(
    status: DeliveryStatus.delivered,
    deliveredLitres: 1.0,
  );
  return RouteSummary(
    executiveName: _exec,
    dateLabel: _date,
    routeLabel: _routeLbl,
    stops: stops,
  );
}
