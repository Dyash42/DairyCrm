import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/error.dart';
import '../state/route_provider.dart';
import '../sync/sync_engine.dart';
import '../theme/tokens.dart';

/// End-of-day summary. Milkman taps "Submit day report" from the route
/// complete card → lands here → reviews totals → confirms.
///
/// On submit:
///   1. Drain any pending offline scans (best-effort).
///   2. POST /deliveries/end-of-day with the milkman's tally.
///   3. Show the variance the backend computed (if any) and pop home.
class EndOfDayScreen extends ConsumerStatefulWidget {
  const EndOfDayScreen({super.key});

  @override
  ConsumerState<EndOfDayScreen> createState() => _EndOfDayScreenState();
}

class _EndOfDayScreenState extends ConsumerState<EndOfDayScreen> {
  bool _submitting = false;

  Future<void> _submit() async {
    if (_submitting) return;
    setState(() => _submitting = true);

    final summary = ref.read(routeSummaryProvider);
    final syncController = ref.read(syncEngineProvider.notifier);
    final api = ref.read(deliveryApiProvider);

    try {
      // Flush any queued scans before reporting so the backend sees them.
      await syncController.drainNow();

      final report = await api.submitEndOfDay(
        reportedCashTotal: summary.amountToCollect.toDouble(),
      );

      if (!mounted) return;
      final variance = report.cashVariance ?? 0;
      final msg = variance.abs() < 0.01
          ? 'Day report submitted'
          : 'Day report submitted — variance ₹${variance.toStringAsFixed(2)}';
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text(msg),
          backgroundColor: variance.abs() < 0.01
              ? JharanaiTokens.successDark
              : JharanaiTokens.warningDark,
        ),
      );
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          content: Text('Submit failed: ${e.message}'),
          backgroundColor: JharanaiTokens.dangerDark,
        ),
      );
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
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
              const Text(
                'Day summary',
                style: TextStyle(
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                  color: JharanaiTokens.textPrimary,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                '${summary.dateLabel} · ${summary.routeLabel}',
                style: const TextStyle(
                    color: JharanaiTokens.textSecondary, fontSize: 13),
              ),
              const SizedBox(height: 24),
              _StatRow(label: 'Customers served', value: '${summary.servedCount}'),
              _StatRow(
                  label: 'Litres delivered',
                  value: '${fmt(summary.litresDeliveredTotal)} L'),
              _StatRow(label: 'Skipped', value: '${summary.skippedCount}'),
              _StatRow(
                  label: 'Amount to collect',
                  value: '₹${summary.amountToCollect}'),
              const SizedBox(height: 24),
              if (sync.queueDepth > 0)
                Container(
                  padding: const EdgeInsets.all(12),
                  decoration: BoxDecoration(
                    color: JharanaiTokens.warningLight,
                    borderRadius:
                        BorderRadius.circular(JharanaiTokens.radiusLg),
                  ),
                  child: Row(
                    children: [
                      const Icon(Icons.cloud_upload_rounded,
                          color: JharanaiTokens.warningDark),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          '${sync.queueDepth} scan(s) still syncing — submitting will flush them first',
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
                  onPressed: _submitting ? null : _submit,
                  child: _submitting
                      ? const SizedBox(
                          height: 22,
                          width: 22,
                          child: CircularProgressIndicator(
                            color: Colors.white, strokeWidth: 2.5),
                        )
                      : const Text('Submit day report'),
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
