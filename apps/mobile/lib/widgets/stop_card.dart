import 'package:flutter/material.dart';

import '../models/delivery_stop.dart';
import '../theme/tokens.dart';

/// One row in the delivery sequence — handles all 4 visual states:
/// PENDING (with "Scan to deliver" tap target), DELIVERED, partial, SKIPPED.
class StopCard extends StatelessWidget {
  const StopCard({
    super.key,
    required this.stop,
    required this.onScanPressed,
    required this.onMorePressed,
  });

  final DeliveryStop stop;
  final VoidCallback onScanPressed;
  final VoidCallback onMorePressed;

  @override
  Widget build(BuildContext context) {
    return Container(
      margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      decoration: BoxDecoration(
        color: JharanaiTokens.surface,
        borderRadius: BorderRadius.circular(JharanaiTokens.radiusLg),
        border: Border.all(color: JharanaiTokens.border),
      ),
      child: InkWell(
        onTap: onMorePressed,
        borderRadius: BorderRadius.circular(JharanaiTokens.radiusLg),
        child: Padding(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  _SeqBadge(seq: stop.sequence, status: stop.status),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                '${stop.customerName} · ${stop.houseNumber}',
                                style: const TextStyle(
                                  fontWeight: FontWeight.w600,
                                  fontSize: 15,
                                  color: JharanaiTokens.textPrimary,
                                ),
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                              ),
                            ),
                            _LitresChip(stop: stop),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          stop.addressLine,
                          style: const TextStyle(
                            color: JharanaiTokens.textSecondary,
                            fontSize: 13,
                          ),
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ],
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 10),
              _ActionRow(stop: stop, onScanPressed: onScanPressed),
            ],
          ),
        ),
      ),
    );
  }
}

class _SeqBadge extends StatelessWidget {
  const _SeqBadge({required this.seq, required this.status});

  final int seq;
  final DeliveryStatus status;

  @override
  Widget build(BuildContext context) {
    final isDone = status == DeliveryStatus.delivered ||
        status == DeliveryStatus.partial;
    final isSkipped = status == DeliveryStatus.skipped;

    Color bg;
    Color fg;
    Widget child;

    if (isDone) {
      bg = JharanaiTokens.successLight;
      fg = JharanaiTokens.successDark;
      child = const Icon(Icons.check_rounded, size: 16);
    } else if (isSkipped) {
      bg = JharanaiTokens.surfaceMuted;
      fg = JharanaiTokens.textMuted;
      child = const Icon(Icons.do_not_disturb_alt_rounded, size: 14);
    } else {
      bg = JharanaiTokens.brand50;
      fg = JharanaiTokens.brand;
      child = Text(
        '$seq',
        style: TextStyle(
          color: fg,
          fontWeight: FontWeight.w700,
          fontSize: 13,
          fontFeatures: const [FontFeature.tabularFigures()],
        ),
      );
    }

    return Container(
      width: 28,
      height: 28,
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Center(
        child: DefaultTextStyle(
          style: TextStyle(color: fg),
          child: IconTheme(
            data: IconThemeData(color: fg),
            child: child,
          ),
        ),
      ),
    );
  }
}

class _LitresChip extends StatelessWidget {
  const _LitresChip({required this.stop});

  final DeliveryStop stop;

  @override
  Widget build(BuildContext context) {
    final value = stop.isDelivered && stop.deliveredLitres != null
        ? stop.deliveredLitres!
        : stop.scheduledLitres;
    final color = stop.isDelivered
        ? JharanaiTokens.successDark
        : stop.isSkipped
            ? JharanaiTokens.textMuted
            : JharanaiTokens.textPrimary;

    return Row(
      crossAxisAlignment: CrossAxisAlignment.baseline,
      textBaseline: TextBaseline.alphabetic,
      children: [
        Text(
          _fmt(value),
          style: TextStyle(
            color: color,
            fontWeight: FontWeight.w700,
            fontSize: 17,
            fontFeatures: const [FontFeature.tabularFigures()],
          ),
        ),
        Text(
          ' L',
          style: TextStyle(
            color: color,
            fontSize: 12,
            fontWeight: FontWeight.w500,
          ),
        ),
      ],
    );
  }

  String _fmt(double v) {
    if (v == v.roundToDouble()) return v.toStringAsFixed(0);
    return v.toStringAsFixed(1);
  }
}

class _ActionRow extends StatelessWidget {
  const _ActionRow({required this.stop, required this.onScanPressed});

  final DeliveryStop stop;
  final VoidCallback onScanPressed;

  @override
  Widget build(BuildContext context) {
    if (stop.isPending) {
      return Row(
        children: [
          const _StatusPill(
            label: 'PENDING',
            bg: JharanaiTokens.warningLight,
            fg: JharanaiTokens.warningDark,
          ),
          const Spacer(),
          OutlinedButton.icon(
            onPressed: onScanPressed,
            icon: const Icon(Icons.qr_code_scanner_rounded, size: 16),
            label: const Text('Scan to deliver'),
            style: OutlinedButton.styleFrom(
              foregroundColor: JharanaiTokens.brand,
              side: const BorderSide(color: JharanaiTokens.brand),
              padding:
                  const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
              shape: RoundedRectangleBorder(
                borderRadius:
                    BorderRadius.circular(JharanaiTokens.radiusMd),
              ),
              textStyle:
                  const TextStyle(fontWeight: FontWeight.w600, fontSize: 13),
            ),
          ),
        ],
      );
    }

    if (stop.isSkipped) {
      return const Row(
        children: [
          _StatusPill(
            label: 'SKIPPED',
            bg: Color(0xFFEFF1F4),
            fg: JharanaiTokens.textMuted,
          ),
        ],
      );
    }

    // Delivered / partial
    final isPartial = stop.isPartial;
    return Row(
      children: [
        const _StatusPill(
          label: 'DELIVERED',
          bg: JharanaiTokens.successLight,
          fg: JharanaiTokens.successDark,
          icon: Icons.check_circle_rounded,
        ),
        if (isPartial)
          Padding(
            padding: const EdgeInsets.only(left: 8),
            child: Text(
              'partial · was ${stop.scheduledLitres.toStringAsFixed(stop.scheduledLitres % 1 == 0 ? 0 : 1)} L',
              style: const TextStyle(
                color: JharanaiTokens.textSecondary,
                fontSize: 12,
                fontStyle: FontStyle.italic,
              ),
            ),
          ),
      ],
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({
    required this.label,
    required this.bg,
    required this.fg,
    this.icon,
  });

  final String label;
  final Color bg;
  final Color fg;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, color: fg, size: 13),
            const SizedBox(width: 4),
          ],
          Text(
            label,
            style: TextStyle(
              color: fg,
              fontSize: 11,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}
