import 'package:flutter/material.dart';

import '../models/delivery_stop.dart';
import '../theme/tokens.dart';

/// The top section: greeting, executive name, date · route, and the three
/// stat tiles (Customers · Litres left · Completion).
class RouteHeader extends StatelessWidget {
  const RouteHeader({super.key, required this.summary});

  final RouteSummary summary;

  @override
  Widget build(BuildContext context) {
    final initial = summary.executiveName.isNotEmpty
        ? summary.executiveName[0].toUpperCase()
        : '?';

    return Container(
      width: double.infinity,
      color: JharanaiTokens.brand,
      padding: const EdgeInsets.fromLTRB(20, 24, 20, 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          // Greeting line
          Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: Colors.white.withOpacity(0.15),
                  borderRadius: BorderRadius.circular(22),
                ),
                child: Center(
                  child: Text(
                    initial,
                    style: const TextStyle(
                      color: Colors.white,
                      fontWeight: FontWeight.w700,
                      fontSize: 18,
                    ),
                  ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Good morning,',
                      style: TextStyle(
                        color: Colors.white70,
                        fontSize: 13,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      summary.executiveName,
                      style: const TextStyle(
                        color: Colors.white,
                        fontWeight: FontWeight.w700,
                        fontSize: 20,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Padding(
            padding: const EdgeInsets.only(left: 56),
            child: Text(
              '${summary.dateLabel} · ${summary.routeLabel}',
              style: const TextStyle(
                color: Colors.white70,
                fontSize: 12,
              ),
            ),
          ),
          const SizedBox(height: 20),
          // Stat tiles
          Row(
            children: [
              Expanded(
                child: _StatTile(
                  icon: Icons.groups_rounded,
                  value:
                      '${summary.servedCount}/${summary.totalCustomers}',
                  label: 'CUSTOMERS',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _StatTile(
                  icon: Icons.water_drop_rounded,
                  value: _fmtLitres(summary.litresLeft),
                  unit: 'L',
                  label: 'LITRES LEFT',
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: _StatTile(
                  value: '${summary.completionPct}',
                  unit: '%',
                  label: 'COMPLETION',
                ),
              ),
            ],
          ),
        ],
      ),
    );
  }

  String _fmtLitres(double v) {
    if (v == v.roundToDouble()) return v.toStringAsFixed(0);
    return v.toStringAsFixed(1);
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({
    this.icon,
    required this.value,
    required this.label,
    this.unit,
  });

  final IconData? icon;
  final String value;
  final String? unit;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 12),
      decoration: BoxDecoration(
        color: Colors.white.withOpacity(0.12),
        borderRadius: BorderRadius.circular(JharanaiTokens.radiusLg),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 16, color: Colors.white.withOpacity(0.7)),
            const SizedBox(height: 6),
          ],
          Row(
            crossAxisAlignment: CrossAxisAlignment.baseline,
            textBaseline: TextBaseline.alphabetic,
            children: [
              Flexible(
                child: Text(
                  value,
                  style: const TextStyle(
                    color: Colors.white,
                    fontSize: 20,
                    fontWeight: FontWeight.w700,
                    fontFeatures: [FontFeature.tabularFigures()],
                  ),
                ),
              ),
              if (unit != null)
                Padding(
                  padding: const EdgeInsets.only(left: 2),
                  child: Text(
                    unit!,
                    style: const TextStyle(
                      color: Colors.white70,
                      fontSize: 13,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ),
            ],
          ),
          const SizedBox(height: 2),
          Text(
            label,
            style: const TextStyle(
              color: Colors.white60,
              fontSize: 10,
              letterSpacing: 0.6,
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}
