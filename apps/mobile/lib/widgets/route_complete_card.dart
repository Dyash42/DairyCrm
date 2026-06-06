import 'package:flutter/material.dart';

import '../models/delivery_stop.dart';
import '../theme/tokens.dart';

class RouteCompleteCard extends StatelessWidget {
  const RouteCompleteCard({
    super.key,
    required this.summary,
    required this.onSubmitDayReport,
  });

  final RouteSummary summary;
  final VoidCallback onSubmitDayReport;

  @override
  Widget build(BuildContext context) {
    final hasSkipped = summary.skippedCount > 0;
    return Container(
      margin: const EdgeInsets.fromLTRB(16, 16, 16, 8),
      padding: const EdgeInsets.fromLTRB(20, 22, 20, 18),
      decoration: BoxDecoration(
        color: JharanaiTokens.successLight,
        borderRadius: BorderRadius.circular(JharanaiTokens.radiusLg),
        border: Border.all(color: JharanaiTokens.success.withOpacity(0.3)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          const Row(
            children: [
              Icon(Icons.task_alt_rounded,
                  color: JharanaiTokens.successDark, size: 28),
              SizedBox(width: 10),
              Text(
                'Route complete!',
                style: TextStyle(
                  color: JharanaiTokens.successDark,
                  fontSize: 20,
                  fontWeight: FontWeight.w700,
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),
          Text(
            'Great work, ${summary.executiveName.split(" ").first}. All stops done.',
            style: const TextStyle(
              color: JharanaiTokens.textSecondary,
              fontSize: 14,
            ),
          ),
          const SizedBox(height: 16),
          // 3 stat columns
          Row(
            children: [
              Expanded(
                child: _SuccessStat(
                  value: '${summary.servedCount}',
                  label: 'SERVED',
                ),
              ),
              Expanded(
                child: _SuccessStat(
                  value: _fmt(summary.litresDeliveredTotal),
                  unit: 'L',
                  label: 'DELIVERED',
                ),
              ),
              Expanded(
                child: _SuccessStat(
                  value: '₹${summary.amountToCollect}',
                  label: 'TO COLLECT',
                ),
              ),
            ],
          ),
          if (hasSkipped) ...[
            const SizedBox(height: 16),
            Container(
              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.6),
                borderRadius: BorderRadius.circular(8),
              ),
              child: Row(
                children: [
                  const Icon(Icons.info_outline_rounded,
                      size: 16, color: JharanaiTokens.textSecondary),
                  const SizedBox(width: 8),
                  Expanded(
                    child: Text(
                      '${summary.skippedCount} stop${summary.skippedCount == 1 ? "" : "s"} skipped — will auto-retry tomorrow.',
                      style: const TextStyle(
                        color: JharanaiTokens.textSecondary,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 14),
          SizedBox(
            width: double.infinity,
            height: 48,
            child: ElevatedButton(
              onPressed: onSubmitDayReport,
              child: const Text('Submit day report'),
            ),
          ),
        ],
      ),
    );
  }

  String _fmt(double v) {
    if (v == v.roundToDouble()) return v.toStringAsFixed(0);
    return v.toStringAsFixed(1);
  }
}

class _SuccessStat extends StatelessWidget {
  const _SuccessStat({required this.value, required this.label, this.unit});

  final String value;
  final String? unit;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.center,
      children: [
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.baseline,
          textBaseline: TextBaseline.alphabetic,
          children: [
            Text(
              value,
              style: const TextStyle(
                color: JharanaiTokens.textPrimary,
                fontSize: 26,
                fontWeight: FontWeight.w700,
                fontFeatures: [FontFeature.tabularFigures()],
              ),
            ),
            if (unit != null)
              Text(
                unit!,
                style: const TextStyle(
                  color: JharanaiTokens.textSecondary,
                  fontSize: 13,
                  fontWeight: FontWeight.w500,
                ),
              ),
          ],
        ),
        const SizedBox(height: 2),
        Text(
          label,
          style: const TextStyle(
            color: JharanaiTokens.textMuted,
            fontSize: 10,
            letterSpacing: 0.5,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}
