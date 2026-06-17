import 'package:flutter/foundation.dart' show kDebugMode;
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/delivery_api.dart';
import '../api/error.dart';
import '../auth/auth_provider.dart';
import '../models/delivery_stop.dart';
import '../state/route_provider.dart';
import '../sync/connectivity.dart';
import '../sync/sync_engine.dart';
import '../theme/tokens.dart';
import '../widgets/confirm_delivery_sheet.dart';
import '../widgets/offline_banner.dart';
import '../widgets/route_complete_card.dart';
import '../widgets/route_header.dart';
import '../widgets/stop_card.dart';
import 'end_of_day_screen.dart';
import 'profile_screen.dart';
import 'qr_scanner_screen.dart';

class TodaysRouteScreen extends ConsumerStatefulWidget {
  const TodaysRouteScreen({super.key});

  @override
  ConsumerState<TodaysRouteScreen> createState() =>
      _TodaysRouteScreenState();
}

class _TodaysRouteScreenState extends ConsumerState<TodaysRouteScreen> {
  final _searchCtl = TextEditingController();
  String _query = '';

  @override
  void dispose() {
    _searchCtl.dispose();
    super.dispose();
  }

  List<DeliveryStop> _filter(List<DeliveryStop> stops) {
    if (_query.isEmpty) return stops;
    final q = _query.toLowerCase();
    return stops.where((s) {
      return s.customerName.toLowerCase().contains(q) ||
          s.houseNumber.toLowerCase().contains(q) ||
          s.addressLine.toLowerCase().contains(q);
    }).toList();
  }

  Future<void> _openScanFlow(DeliveryStop? preferredStop) async {
    // Open camera scanner. On decode, resolve QR code → DeliveryStop +
    // open confirm sheet.
    await Navigator.of(context).push(
      MaterialPageRoute<void>(
        builder: (_) => QrScannerScreen(
          onScanned: (rawCode) async {
            // Resolve scanned code to a customer + matching stop. We pick
            // the preferredStop if its customerCode matches; otherwise
            // search the route for it; otherwise show a "not on this
            // route" snackbar.
            final summary = ref.read(routeSummaryProvider);
            final code = rawCode.trim().toUpperCase();

            DeliveryStop? match;
            for (final s in summary.stops) {
              if (s.customerCode.toUpperCase() == code) {
                match = s;
                break;
              }
            }

            // If not on the route, try the by-code endpoint to confirm
            // the QR is valid, then surface a clear error.
            if (match == null) {
              try {
                await ref.read(deliveryApiProvider).lookupByCode(code);
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('$code is not on today\'s route'),
                      backgroundColor: JharanaiTokens.warningDark,
                    ),
                  );
                }
              } on ApiException {
                if (mounted) {
                  ScaffoldMessenger.of(context).showSnackBar(
                    SnackBar(
                      content: Text('Unknown QR: $code'),
                      backgroundColor: JharanaiTokens.dangerDark,
                    ),
                  );
                }
              }
              return;
            }
            if (!mounted) return;
            _openConfirmSheet(match);
          },
        ),
      ),
    );
    // Suppress unused
    preferredStop;
  }

  void _openConfirmSheet(DeliveryStop stop) {
    final routeNotifier = ref.read(routeSnapshotProvider.notifier);
    final sync = ref.read(syncEngineProvider.notifier);
    ConfirmDeliverySheet.show(
      context,
      stop: stop,
      onDeliver: (qty, cash) async {
        await routeNotifier.markDelivered(stop.id, qty);
        await sync.recordScan(
          deliveryId: stop.id,
          customerCode: stop.customerCode,
          deliveredLitres: qty,
          cashCollected: cash,
          kind: qty < stop.scheduledLitres ? 'PARTIAL' : 'DELIVERED',
        );
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Delivered ${_fmt(qty)} L to ${stop.customerName}'),
            backgroundColor: JharanaiTokens.successDark,
          ),
        );
      },
      onSkip: () async {
        await routeNotifier.markSkipped(stop.id);
        await sync.recordScan(
          deliveryId: stop.id,
          customerCode: stop.customerCode,
          deliveredLitres: 0,
          note: 'Skipped',
          kind: 'SKIPPED',
        );
        if (!mounted) return;
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(
            content: Text('Skipped ${stop.customerName}'),
            backgroundColor: JharanaiTokens.textSecondary,
          ),
        );
      },
    );
  }

  String _fmt(double v) =>
      v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1);

  @override
  Widget build(BuildContext context) {
    final summary = ref.watch(routeSummaryProvider);
    final isOffline = ref.watch(isOfflineStreamProvider);
    final queued = ref.watch(syncEngineProvider).queueDepth;
    final visibleStops = _filter(summary.stops);

    return Scaffold(
      backgroundColor: JharanaiTokens.bg,
      // Dev drawer is debug-only — kDebugMode is a const compile-time
      // boolean, so in release builds tree-shaking eliminates the
      // drawer + all DemoMode wiring entirely. The previous code
      // exposed the demo-mode picker to real milkmen, who could
      // accidentally show fake data and confuse the backend audit.
      drawer: kDebugMode ? const _DevDrawer() : null,
      body: SafeArea(
        bottom: false,
        child: Column(
          children: [
            if (isOffline) OfflineBanner(queuedCount: queued),
            Stack(
              children: [
                RouteHeader(summary: summary),
                Positioned(
                  top: 12,
                  left: 8,
                  child: Builder(
                    builder: (context) => IconButton(
                      icon: const Icon(Icons.menu_rounded,
                          color: Colors.white),
                      onPressed: () => Scaffold.of(context).openDrawer(),
                    ),
                  ),
                ),
              ],
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.only(top: 16, bottom: 120),
                children: [
                  // Search
                  Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 16),
                    child: TextField(
                      controller: _searchCtl,
                      onChanged: (v) => setState(() => _query = v),
                      decoration: InputDecoration(
                        hintText: 'Search customer, house, area',
                        prefixIcon: const Icon(Icons.search_rounded, size: 18),
                        filled: true,
                        fillColor: JharanaiTokens.surface,
                        contentPadding: EdgeInsets.zero,
                        border: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(
                              JharanaiTokens.radiusLg),
                          borderSide:
                              const BorderSide(color: JharanaiTokens.border),
                        ),
                        enabledBorder: OutlineInputBorder(
                          borderRadius: BorderRadius.circular(
                              JharanaiTokens.radiusLg),
                          borderSide:
                              const BorderSide(color: JharanaiTokens.border),
                        ),
                      ),
                    ),
                  ),
                  // Section header
                  Padding(
                    padding: const EdgeInsets.fromLTRB(20, 18, 20, 6),
                    child: Row(
                      children: [
                        const Text(
                          'DELIVERY SEQUENCE',
                          style: TextStyle(
                            color: JharanaiTokens.textMuted,
                            fontSize: 11,
                            fontWeight: FontWeight.w700,
                            letterSpacing: 0.6,
                          ),
                        ),
                        const Spacer(),
                        if (!summary.isComplete)
                          Text(
                            '${summary.pendingCount} pending',
                            style: const TextStyle(
                              color: JharanaiTokens.textSecondary,
                              fontSize: 12,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                      ],
                    ),
                  ),
                  if (summary.isComplete)
                    RouteCompleteCard(
                      summary: summary,
                      onSubmitDayReport: () {
                        Navigator.of(context).push(
                          MaterialPageRoute<void>(
                            builder: (_) => const EndOfDayScreen(),
                          ),
                        );
                      },
                    ),
                  ...visibleStops.map(
                    (stop) => StopCard(
                      stop: stop,
                      onScanPressed: () => _openScanFlow(stop),
                      onMorePressed: () {
                        if (stop.isPending) {
                          _openConfirmSheet(stop);
                        }
                      },
                    ),
                  ),
                  if (visibleStops.isEmpty)
                    const Padding(
                      padding: EdgeInsets.all(32),
                      child: Center(
                        child: Text(
                          'No matches',
                          style: TextStyle(
                            color: JharanaiTokens.textMuted,
                          ),
                        ),
                      ),
                    ),
                ],
              ),
            ),
          ],
        ),
      ),
      floatingActionButton: summary.isComplete
          ? null
          : FloatingActionButton.extended(
              backgroundColor: JharanaiTokens.brand,
              foregroundColor: Colors.white,
              icon: const Icon(Icons.qr_code_scanner_rounded),
              label: const Text('Scan QR'),
              onPressed: () async => _openScanFlow(null),
            ),
    );
  }
}

/// Dev-only drawer to flip between the 4 design states from the PDF.
/// Remove before release, or hide behind a "build dashboard" flag.
class _DevDrawer extends ConsumerWidget {
  const _DevDrawer();

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final mode = ref.watch(demoModeProvider);
    return Drawer(
      backgroundColor: JharanaiTokens.surface,
      child: SafeArea(
        child: ListView(
          padding: const EdgeInsets.symmetric(vertical: 16),
          children: [
            const Padding(
              padding: EdgeInsets.fromLTRB(20, 0, 20, 16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Dev menu',
                    style: TextStyle(
                      fontSize: 17,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  SizedBox(height: 4),
                  Text(
                    'Preview the 4 design states from the PDF',
                    style: TextStyle(
                      color: JharanaiTokens.textSecondary,
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            _modeTile(ref, mode, DemoMode.off,
                'Live data · from backend', Icons.cloud_done_outlined),
            _modeTile(ref, mode, DemoMode.defaultMorning,
                'Demo: Default morning · 0/10', Icons.wb_sunny_outlined),
            _modeTile(ref, mode, DemoMode.midRoute,
                'Demo: Mid-route · 6/10 (+1 partial, +1 skipped)',
                Icons.timelapse_rounded),
            _modeTile(ref, mode, DemoMode.routeComplete,
                'Demo: Route complete · 9/10', Icons.task_alt_rounded),
            const Divider(),
            ListTile(
              leading: const Icon(Icons.person_outline,
                  color: JharanaiTokens.textPrimary),
              title: const Text('Account & help'),
              onTap: () {
                Navigator.of(context).pop();
                Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => const ProfileScreen()),
                );
              },
            ),
            ListTile(
              leading: const Icon(Icons.logout_rounded,
                  color: JharanaiTokens.dangerDark),
              title: const Text(
                'Sign out',
                style: TextStyle(color: JharanaiTokens.dangerDark),
              ),
              onTap: () {
                Navigator.of(context).pop();
                ref.read(authStateProvider.notifier).signOut();
              },
            ),
          ],
        ),
      ),
    );
  }

  Widget _modeTile(
      WidgetRef ref, DemoMode current, DemoMode value, String label,
      IconData icon) {
    final selected = current == value;
    return ListTile(
      leading: Icon(icon,
          color: selected ? JharanaiTokens.brand : JharanaiTokens.textSecondary),
      title: Text(
        label,
        style: TextStyle(
          fontWeight: selected ? FontWeight.w600 : FontWeight.w400,
          color: selected
              ? JharanaiTokens.brand
              : JharanaiTokens.textPrimary,
          fontSize: 14,
        ),
      ),
      selected: selected,
      onTap: () {
        ref.read(demoModeProvider.notifier).state = value;
      },
    );
  }
}
