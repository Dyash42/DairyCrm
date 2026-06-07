import 'package:flutter/material.dart';

import '../theme/tokens.dart';

/// Field-team help screen. Plain Markdown-ish text, no external links — the
/// app must work offline, including this screen.
class HelpScreen extends StatelessWidget {
  const HelpScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: JharanaiTokens.bg,
      appBar: AppBar(
        title: const Text('How to use the app'),
        backgroundColor: JharanaiTokens.surface,
        foregroundColor: JharanaiTokens.textPrimary,
        elevation: 0,
        scrolledUnderElevation: 0,
        bottom: const PreferredSize(
          preferredSize: Size.fromHeight(1),
          child: Divider(height: 1, color: JharanaiTokens.divider),
        ),
      ),
      body: ListView(
        padding: const EdgeInsets.fromLTRB(20, 16, 20, 24),
        children: const [
          _Step(
            number: '1',
            title: 'Open the app at the start of your shift',
            body:
                'Your assigned route loads with every customer on it, in the right '
                "order. Each customer's QR code is shown at their door.",
          ),
          SizedBox(height: 16),
          _Step(
            number: '2',
            title: 'Drop the milk, then scan the QR',
            body:
                'Tap the green Scan button. Point the camera at the QR. The '
                "customer's row turns green — that's the receipt for everyone.",
          ),
          SizedBox(height: 16),
          _Step(
            number: '3',
            title: 'Partial / extra / skipped? Use the sheet',
            body:
                "After the scan, a sheet pops up. If they took less than usual "
                'or skipped today, change the litres or tap Skip with a reason. '
                "The customer sees what you logged — keep it accurate.",
          ),
          SizedBox(height: 16),
          _Step(
            number: '4',
            title: "If you're offline, keep going",
            body:
                'Scans queue up on your phone. When the signal comes back the '
                'app syncs everything to the office. The header shows a small '
                'badge when scans are pending.',
          ),
          SizedBox(height: 16),
          _Step(
            number: '5',
            title: 'End of day: report cash + drive home',
            body:
                "Tap End of day from the route screen. Enter the total cash "
                'you collected today. That submission closes the route and '
                "tells the office you're done.",
          ),
          SizedBox(height: 24),
          _Banner(
            icon: Icons.info_outline,
            title: 'Lost or damaged QR?',
            body:
                "Call the office. They can regenerate a fresh QR from the admin "
                "panel — the customer's account stays the same.",
          ),
          SizedBox(height: 12),
          _Banner(
            icon: Icons.shield_outlined,
            title: 'Never share your OTP',
            body:
                "We only ever ask for the OTP on this app's login screen. "
                "Office staff will never call you to read out your code.",
          ),
        ],
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.number, required this.title, required this.body});

  final String number;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: JharanaiTokens.surface,
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: JharanaiTokens.border),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Container(
            width: 32,
            height: 32,
            decoration: BoxDecoration(
              color: JharanaiTokens.brand50,
              borderRadius: BorderRadius.circular(8),
            ),
            alignment: Alignment.center,
            child: Text(
              number,
              style: const TextStyle(
                fontSize: 15,
                fontWeight: FontWeight.w700,
                color: JharanaiTokens.brand,
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 15,
                    fontWeight: FontWeight.w600,
                    color: JharanaiTokens.textPrimary,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  body,
                  style: const TextStyle(
                    fontSize: 13.5,
                    height: 1.4,
                    color: JharanaiTokens.textSecondary,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Banner extends StatelessWidget {
  const _Banner({
    required this.icon,
    required this.title,
    required this.body,
  });

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: JharanaiTokens.warningLight,
        borderRadius: BorderRadius.circular(12),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Icon(icon, color: JharanaiTokens.warningDark, size: 20),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  title,
                  style: const TextStyle(
                    fontSize: 14,
                    fontWeight: FontWeight.w700,
                    color: JharanaiTokens.warningDark,
                  ),
                ),
                const SizedBox(height: 4),
                Text(
                  body,
                  style: const TextStyle(
                    fontSize: 13,
                    color: JharanaiTokens.textPrimary,
                    height: 1.4,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
