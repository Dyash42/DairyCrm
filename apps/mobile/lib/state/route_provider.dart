import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/client.dart';
import '../api/delivery_api.dart';
import '../api/error.dart';
import '../auth/auth_provider.dart';
import '../models/delivery_stop.dart';

/// Source of the data the screen is currently rendering.
enum RouteDataSource { loading, live, demo, error }

/// Demo modes — flip via the dev menu (debug builds) to render each
/// design state. In production the screen always loads live data.
enum DemoMode { off, defaultMorning, midRoute, routeComplete, offline }

// Demo default: `defaultMorning` so the route screen shows seeded
// data immediately when the app boots without a JWT. Set back to
// `DemoMode.off` once real login is restored.
final demoModeProvider = StateProvider<DemoMode>((_) => DemoMode.defaultMorning);

/// Whether the app is offline (banner + queue counter).
final isOfflineProvider = StateProvider<bool>((_) => false);
final queuedScanCountProvider = StateProvider<int>((_) => 0);

/// API instance — Riverpod so tests can override.
final deliveryApiProvider = Provider<DeliveryApi>((ref) {
  return DeliveryApi(ref.watch(apiClientProvider));
});

/// What the Today screen consumes. Holds both the summary and the
/// data-source flag so the UI can render a "live" or "demo" pill.
class RouteSnapshot {
  RouteSnapshot({
    required this.summary,
    required this.source,
    this.errorMessage,
  });
  final RouteSummary summary;
  final RouteDataSource source;
  final String? errorMessage;

  RouteSnapshot copyWith({
    RouteSummary? summary,
    RouteDataSource? source,
    String? errorMessage,
  }) {
    return RouteSnapshot(
      summary: summary ?? this.summary,
      source: source ?? this.source,
      errorMessage: errorMessage,
    );
  }
}

/// Holds + refreshes the route. Subscribes to auth state so a fresh login
/// triggers a reload, and exposes markDelivered/markSkipped for the UI.
class RouteNotifier extends StateNotifier<RouteSnapshot> {
  RouteNotifier(this._ref)
      : super(RouteSnapshot(
          // Seed initial state from the current demoMode so apps that
          // boot with a non-off mode (e.g. login-bypass demo build)
          // show real seeded data immediately instead of an empty
          // loading shell.
          summary: _ref.read(demoModeProvider) == DemoMode.off
              ? _emptySummary()
              : _demoSummary(_ref.read(demoModeProvider)),
          source: _ref.read(demoModeProvider) == DemoMode.off
              ? RouteDataSource.loading
              : RouteDataSource.demo,
        )) {
    _ref.listen<AuthState>(authStateProvider, (_, next) {
      if (next is AuthSignedIn) {
        refresh();
      } else if (next is AuthSignedOut) {
        state = RouteSnapshot(summary: _emptySummary(), source: RouteDataSource.loading);
      }
    });
    _ref.listen<DemoMode>(demoModeProvider, (_, mode) {
      if (mode != DemoMode.off) {
        state = RouteSnapshot(summary: _demoSummary(mode), source: RouteDataSource.demo);
      } else {
        refresh();
      }
    });
    // Kick off an initial load if we're already signed in.
    final auth = _ref.read(authStateProvider);
    if (auth is AuthSignedIn) refresh();
  }

  final Ref _ref;

  /// Fetch today's route. On error keeps the previous data + flags
  /// `source = error`. The UI shows a small banner; the data does not
  /// vanish.
  Future<void> refresh() async {
    if (_ref.read(demoModeProvider) != DemoMode.off) return;
    state = state.copyWith(source: RouteDataSource.loading);
    try {
      final api = _ref.read(deliveryApiProvider);
      final res = await api.todaysRoute();
      final summary = RouteSummary(
        executiveName: _execName(),
        dateLabel: _dateLabel(res.date),
        routeLabel: res.routeId == null ? 'No route assigned' : 'Today',
        stops: res.stops,
      );
      state = RouteSnapshot(summary: summary, source: RouteDataSource.live);
    } on ApiException catch (e) {
      // Keep whatever we had; flag error.
      state = state.copyWith(source: RouteDataSource.error, errorMessage: e.message);
    }
  }

  String _execName() {
    final user = _ref.read(currentUserProvider);
    return user?.name ?? 'Sales Executive';
  }

  String _dateLabel(String iso) {
    if (iso.isEmpty) return '';
    final d = DateTime.tryParse(iso);
    if (d == null) return '';
    const months = [
      'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
    ];
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return '${days[d.weekday - 1]} ${d.day} ${months[d.month - 1]}';
  }

  /// Optimistic: flip state immediately, then push to server. On failure
  /// the sync engine will retry; the UI banner reflects the queue.
  Future<void> markDelivered(String stopId, double litres) async {
    state = state.copyWith(
      summary: _patchStop(state.summary, stopId, (s) {
        final isPartial = litres < s.scheduledLitres;
        return s.copyWith(
          status: isPartial ? DeliveryStatus.partial : DeliveryStatus.delivered,
          deliveredLitres: litres,
          scannedAt: DateTime.now(),
        );
      }),
    );
    try {
      await _ref.read(deliveryApiProvider).confirm(
            deliveryId: stopId,
            deliveredLitres: litres,
          );
    } on ApiException {
      // Surface the error pill; the sync engine will re-attempt.
      state = state.copyWith(
        source: RouteDataSource.error,
        errorMessage: 'Will sync when online',
      );
    }
  }

  Future<void> markSkipped(String stopId, {String? reason}) async {
    state = state.copyWith(
      summary: _patchStop(state.summary, stopId,
          (s) => s.copyWith(status: DeliveryStatus.skipped)),
    );
    try {
      await _ref.read(deliveryApiProvider).skip(deliveryId: stopId, reason: reason);
    } on ApiException {
      state = state.copyWith(
        source: RouteDataSource.error,
        errorMessage: 'Will sync when online',
      );
    }
  }
}

final routeSnapshotProvider =
    StateNotifierProvider<RouteNotifier, RouteSnapshot>((ref) => RouteNotifier(ref));

/// Back-compat — older widgets watch `routeSummaryProvider` for the
/// RouteSummary directly. We map the snapshot onto it.
final routeSummaryProvider = Provider<RouteSummary>(
  (ref) => ref.watch(routeSnapshotProvider).summary,
);

// --------------------------- helpers ---------------------------

RouteSummary _patchStop(
  RouteSummary s,
  String id,
  DeliveryStop Function(DeliveryStop) f,
) {
  final stops = s.stops
      .map((stop) => stop.id == id ? f(stop) : stop)
      .toList(growable: false);
  return RouteSummary(
    executiveName: s.executiveName,
    dateLabel: s.dateLabel,
    routeLabel: s.routeLabel,
    stops: stops,
  );
}

RouteSummary _emptySummary() => RouteSummary(
      executiveName: '',
      dateLabel: '',
      routeLabel: '',
      stops: const [],
    );

// --------------------------- demo mode ---------------------------
// Kept for the design preview (Dev menu in debug builds).

const _execDemo = 'Ramesh Sahu';
const _dateDemo = 'Mon 2 Jun';
const _routeDemo = 'Route 4 — Berhampur South';

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
    ];

RouteSummary _demoSummary(DemoMode m) {
  final stops = _baseStops();
  switch (m) {
    case DemoMode.midRoute:
    case DemoMode.offline:
      stops[0] = stops[0]
          .copyWith(status: DeliveryStatus.delivered, deliveredLitres: 2.0);
      stops[1] = stops[1]
          .copyWith(status: DeliveryStatus.delivered, deliveredLitres: 1.0);
      stops[2] = stops[2]
          .copyWith(status: DeliveryStatus.partial, deliveredLitres: 2.0);
      stops[3] = stops[3]
          .copyWith(status: DeliveryStatus.delivered, deliveredLitres: 1.5);
      stops[4] = stops[4].copyWith(status: DeliveryStatus.skipped);
      break;
    case DemoMode.routeComplete:
      for (var i = 0; i < stops.length; i++) {
        stops[i] = stops[i]
            .copyWith(
                status: DeliveryStatus.delivered,
                deliveredLitres: stops[i].scheduledLitres);
      }
      stops[4] = stops[4].copyWith(status: DeliveryStatus.skipped);
      break;
    case DemoMode.defaultMorning:
    case DemoMode.off:
      break;
  }
  return RouteSummary(
    executiveName: _execDemo,
    dateLabel: _dateDemo,
    routeLabel: _routeDemo,
    stops: stops,
  );
}
