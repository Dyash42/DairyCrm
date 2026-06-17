import 'package:flutter/material.dart';

import '../theme/tokens.dart';

class OfflineBanner extends StatelessWidget {
  const OfflineBanner({super.key, required this.queuedCount});

  final int queuedCount;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      color: JharanaiTokens.warningLight,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
      child: Row(
        children: [
          const Icon(Icons.cloud_off_rounded,
              size: 18, color: JharanaiTokens.warningDark),
          const SizedBox(width: 8),
          Expanded(
            child: Text(
              'Working offline. $queuedCount scans queued. Will sync',
              style: const TextStyle(
                color: JharanaiTokens.warningDark,
                fontSize: 13,
                fontWeight: FontWeight.w500,
              ),
            ),
          ),
        ],
      ),
    );
  }
}
