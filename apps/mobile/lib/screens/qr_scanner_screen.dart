import 'package:flutter/material.dart';

import '../theme/tokens.dart';

/// QR scanner screen — STUB.
///
/// Production: use the `mobile_scanner` package to read a QR like `JHR-100455`
/// then resolve it to a [DeliveryStop] via the route provider.
///
/// This stub renders the framing UI and a "Simulate scan" button so the rest
/// of the flow can be exercised without a camera or a real scan.
class QrScannerScreen extends StatelessWidget {
  const QrScannerScreen({super.key, required this.onScanned});

  /// Called with the decoded QR payload (the customer code, e.g. JHR-100455).
  final void Function(String code) onScanned;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            // Faux camera grid
            Container(
              decoration: const BoxDecoration(
                gradient: RadialGradient(
                  colors: [Color(0xFF1A2530), Colors.black],
                  radius: 1.2,
                ),
              ),
            ),
            // Center reticle
            Center(
              child: Container(
                width: 240,
                height: 240,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  border:
                      Border.all(color: Colors.white.withOpacity(0.3)),
                ),
                child: Stack(
                  children: [
                    Positioned.fill(
                      child: CustomPaint(painter: _CornerBracketPainter()),
                    ),
                    Center(
                      child: Container(
                        width: 220,
                        height: 2,
                        color: JharanaiTokens.accentLight,
                      ),
                    ),
                  ],
                ),
              ),
            ),
            // Title
            Positioned(
              top: 16,
              left: 0,
              right: 0,
              child: Column(
                children: [
                  const Text(
                    'Scan customer QR',
                    style: TextStyle(
                      color: Colors.white,
                      fontSize: 17,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Point the camera at the sticker on the door',
                    style: TextStyle(
                      color: Colors.white.withOpacity(0.7),
                      fontSize: 12,
                    ),
                  ),
                ],
              ),
            ),
            // Close
            Positioned(
              top: 8,
              left: 8,
              child: IconButton(
                onPressed: () => Navigator.of(context).pop(),
                icon: const Icon(Icons.close_rounded, color: Colors.white),
              ),
            ),
            // Simulate scan
            Positioned(
              bottom: 32,
              left: 24,
              right: 24,
              child: SizedBox(
                height: 52,
                child: ElevatedButton.icon(
                  onPressed: () {
                    Navigator.of(context).pop();
                    onScanned('JHR-DEMO-SCAN');
                  },
                  style: ElevatedButton.styleFrom(
                    backgroundColor: Colors.white,
                    foregroundColor: JharanaiTokens.brand,
                  ),
                  icon: const Icon(Icons.qr_code_2_rounded),
                  label: const Text('Simulate scan (dev)'),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _CornerBracketPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = JharanaiTokens.accentLight
      ..strokeWidth = 3
      ..strokeCap = StrokeCap.round;

    const len = 24.0;

    // top-left
    canvas.drawLine(const Offset(0, 0), const Offset(len, 0), paint);
    canvas.drawLine(const Offset(0, 0), const Offset(0, len), paint);
    // top-right
    canvas.drawLine(Offset(size.width, 0), Offset(size.width - len, 0), paint);
    canvas.drawLine(Offset(size.width, 0), Offset(size.width, len), paint);
    // bottom-left
    canvas.drawLine(
        Offset(0, size.height), Offset(len, size.height), paint);
    canvas.drawLine(
        Offset(0, size.height), Offset(0, size.height - len), paint);
    // bottom-right
    canvas.drawLine(Offset(size.width, size.height),
        Offset(size.width - len, size.height), paint);
    canvas.drawLine(Offset(size.width, size.height),
        Offset(size.width, size.height - len), paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
