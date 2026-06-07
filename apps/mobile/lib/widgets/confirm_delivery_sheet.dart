import 'package:flutter/material.dart';

import '../models/delivery_stop.dart';
import '../theme/tokens.dart';

/// Bottom sheet shown after QR scan (or from the "more" tap).
/// Lets the milkman: confirm scheduled qty, edit qty (partial), enter
/// cash collected, or skip.
class ConfirmDeliverySheet extends StatefulWidget {
  const ConfirmDeliverySheet({
    super.key,
    required this.stop,
    required this.onDeliver,
    required this.onSkip,
  });

  final DeliveryStop stop;
  final void Function(double deliveredLitres, double? cashCollected) onDeliver;
  final VoidCallback onSkip;

  static Future<void> show(
    BuildContext context, {
    required DeliveryStop stop,
    required void Function(double, double?) onDeliver,
    required VoidCallback onSkip,
  }) {
    return showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => ConfirmDeliverySheet(
        stop: stop,
        onDeliver: onDeliver,
        onSkip: onSkip,
      ),
    );
  }

  @override
  State<ConfirmDeliverySheet> createState() => _ConfirmDeliverySheetState();
}

class _ConfirmDeliverySheetState extends State<ConfirmDeliverySheet> {
  late double _qty;
  final _cashCtl = TextEditingController();

  @override
  void initState() {
    super.initState();
    _qty = widget.stop.scheduledLitres;
  }

  @override
  void dispose() {
    _cashCtl.dispose();
    super.dispose();
  }

  void _adjust(double delta) {
    final next = (_qty + delta).clamp(0.0, widget.stop.scheduledLitres);
    setState(() => _qty = double.parse(next.toStringAsFixed(1)));
  }

  @override
  Widget build(BuildContext context) {
    final isPartial = _qty < widget.stop.scheduledLitres;

    return Container(
      decoration: const BoxDecoration(
        color: JharanaiTokens.surface,
        borderRadius: BorderRadius.vertical(top: Radius.circular(20)),
      ),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: EdgeInsets.fromLTRB(
            20,
            12,
            20,
            MediaQuery.of(context).viewInsets.bottom + 20,
          ),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              // Drag handle
              Center(
                child: Container(
                  width: 40,
                  height: 4,
                  margin: const EdgeInsets.only(bottom: 16),
                  decoration: BoxDecoration(
                    color: JharanaiTokens.border,
                    borderRadius: BorderRadius.circular(2),
                  ),
                ),
              ),
              // Customer info
              Row(
                children: [
                  Container(
                    padding: const EdgeInsets.symmetric(
                        horizontal: 8, vertical: 4),
                    decoration: BoxDecoration(
                      color: JharanaiTokens.brand50,
                      borderRadius: BorderRadius.circular(6),
                    ),
                    child: Text(
                      widget.stop.customerCode,
                      style: const TextStyle(
                        color: JharanaiTokens.brand,
                        fontSize: 11,
                        fontWeight: FontWeight.w600,
                        letterSpacing: 0.4,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 12),
              Text(
                '${widget.stop.customerName} · ${widget.stop.houseNumber}',
                style: const TextStyle(
                  fontSize: 18,
                  fontWeight: FontWeight.w700,
                  color: JharanaiTokens.textPrimary,
                ),
              ),
              const SizedBox(height: 4),
              Text(
                widget.stop.addressLine,
                style: const TextStyle(
                  color: JharanaiTokens.textSecondary,
                  fontSize: 13,
                ),
              ),
              const SizedBox(height: 24),
              // Qty stepper
              const Text(
                'Delivering',
                style: TextStyle(
                  color: JharanaiTokens.textSecondary,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 0.4,
                ),
              ),
              const SizedBox(height: 8),
              Row(
                children: [
                  _StepperBtn(
                      icon: Icons.remove_rounded,
                      onTap: () => _adjust(-0.5)),
                  Expanded(
                    child: Center(
                      child: Row(
                        mainAxisSize: MainAxisSize.min,
                        crossAxisAlignment: CrossAxisAlignment.baseline,
                        textBaseline: TextBaseline.alphabetic,
                        children: [
                          Text(
                            _qty.toStringAsFixed(_qty % 1 == 0 ? 0 : 1),
                            style: const TextStyle(
                              fontSize: 44,
                              fontWeight: FontWeight.w700,
                              color: JharanaiTokens.textPrimary,
                              fontFeatures: [
                                FontFeature.tabularFigures(),
                              ],
                            ),
                          ),
                          const SizedBox(width: 4),
                          const Text(
                            'L',
                            style: TextStyle(
                              fontSize: 18,
                              color: JharanaiTokens.textSecondary,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  _StepperBtn(
                      icon: Icons.add_rounded, onTap: () => _adjust(0.5)),
                ],
              ),
              const SizedBox(height: 6),
              Center(
                child: Text(
                  isPartial
                      ? 'Partial · scheduled was ${widget.stop.scheduledLitres.toStringAsFixed(widget.stop.scheduledLitres % 1 == 0 ? 0 : 1)} L'
                      : 'Scheduled quantity',
                  style: TextStyle(
                    color: isPartial
                        ? JharanaiTokens.warningDark
                        : JharanaiTokens.textMuted,
                    fontSize: 12,
                    fontWeight: FontWeight.w500,
                  ),
                ),
              ),
              const SizedBox(height: 20),
              // Cash collection — optional; some customers pay digitally
              const Text(
                'Cash collected (optional)',
                style: TextStyle(
                  color: JharanaiTokens.textSecondary,
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  letterSpacing: 0.4,
                ),
              ),
              const SizedBox(height: 8),
              TextField(
                controller: _cashCtl,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: InputDecoration(
                  prefixText: '₹ ',
                  hintText: '0',
                  filled: true,
                  fillColor: JharanaiTokens.surfaceMuted,
                  contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
                  border: OutlineInputBorder(
                    borderRadius: BorderRadius.circular(JharanaiTokens.radiusLg),
                    borderSide: const BorderSide(color: JharanaiTokens.border),
                  ),
                ),
                style: const TextStyle(fontSize: 17),
              ),
              const SizedBox(height: 20),
              SizedBox(
                height: 52,
                child: ElevatedButton.icon(
                  onPressed: () {
                    final cashStr = _cashCtl.text.trim();
                    final cash = cashStr.isEmpty ? null : double.tryParse(cashStr);
                    Navigator.of(context).pop();
                    widget.onDeliver(_qty, cash);
                  },
                  icon: const Icon(Icons.check_rounded),
                  label: const Text('Mark delivered'),
                ),
              ),
              const SizedBox(height: 8),
              TextButton.icon(
                onPressed: () {
                  Navigator.of(context).pop();
                  widget.onSkip();
                },
                icon: const Icon(Icons.do_not_disturb_alt_rounded,
                    size: 16, color: JharanaiTokens.textSecondary),
                label: const Text(
                  'Skip — customer not home',
                  style:
                      TextStyle(color: JharanaiTokens.textSecondary),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _StepperBtn extends StatelessWidget {
  const _StepperBtn({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return InkWell(
      onTap: onTap,
      borderRadius: BorderRadius.circular(28),
      child: Container(
        width: 56,
        height: 56,
        decoration: BoxDecoration(
          color: JharanaiTokens.surfaceMuted,
          borderRadius: BorderRadius.circular(28),
          border: Border.all(color: JharanaiTokens.border),
        ),
        child: Icon(icon, color: JharanaiTokens.brand, size: 24),
      ),
    );
  }
}
