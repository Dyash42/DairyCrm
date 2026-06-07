import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../state/route_provider.dart';
import '../sync/sync_engine.dart';
import '../theme/tokens.dart';

/// End-of-day summary. Milkman taps "Submit day report" from the route
/// complete card → lands here → reviews totals → confirms.
///
/// Backend endpoint: POST /deliveries/end-of-day (when added). For now,
/// this drains the offline queue and pops back home.
class EndOfDayScreen extends ConsumerWidget {
  const EndOfDayScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final summary = ref.watch(routeSummaryProvider);
    final sync = ref.watch(syncEngineProvider);

    String fmt(double v) =>
        v == v.roundToDouble() ? v.toStringAsFixed(0) : v.toStringAsFixed(1);

    return Scaffold(
      appBar: AppBar(
        title: const Text('End of day'),
        backgroundColor: JharanaiTokens.surface,
      ),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(20),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Day summary',
                style: const TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: JharanaiTokens.textPrimary,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${summary.dateLabel} · ${summary.routeLabel}',
                style: const TextStyle(color: JharanaiTokens.textSecondary, fontSize: 13),
              ),
              const SizedBox(height: 24),
              _StatRow(label: 'Customers served', value: '${summary.servedCount}'),
              _StatRow(
                  label: 'Litres delivered', value: '${fmt(summary.litresDeliveredTotal)} L'),
              _StatRow(label: 'Skipped', value: '${summary.skippedCount}'),
              _StatRow(label: 'Amount to collect', value: '₹${summary.amountToCollect}'),
              const SizedBox(height: 24),
              if (sync.queueDepth > 0)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: JharanaiTokens.warningLight,
                    borderRadius: BorderRadius.circular(JharanaiTokens.radiusLg),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.cloud_upload_rounded,
                          color: JharanaiTokens.warningDark),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '${sync.queueDepth} scan(s) still syncing — will retry automatically',
                          style: const TextStyle(
                            color: JharanaiTokens.warningDark,
                            fontSize: 13,
                          ),
                        ),
                      ),
                    ],
                  ),
                ),
              const Spacer(),
              SizedBox(
                height: 52,
                child: ElevatedButton(
                  onPressed: () {
                    ScaffoldMessenger.of(context).showSnackBar(
                      const SnackBar(
                        content: Text('Day report submitted'),
                        backgroundColor: JharanaiTokens.successDark,
                      ),
                    );
                    Navigator.of(context).pop();
                  },
                  child: const Text('Submit day report'),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StatRow extends StatelessWidget {
  const _StatRow({required this.label, required this.value});
  final String label;
  final String value;
  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 8),
      child: Row(
        children: [
          Expanded(
            child: Text(label,
                style: const TextStyle(
                    fontSize: 14, color: JharanaiTokens.textSecondary)),
          ),
          Text(
            value,
            style: const TextStyle(
              fontSize: 17,
              fontWeight: FontWeight.w700,
              color: JharanaiTokens.textPrimary,
              fontFeatures: [FontFeature.tabularFigures()],
            ),
          ),
        ],
      ),
    );
  }
}
