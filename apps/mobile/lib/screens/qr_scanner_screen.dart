import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:mobile_scanner/mobile_scanner.dart';

import '../theme/tokens.dart';

/// Real camera-backed QR scanner. The scanned payload is the customer's
/// human-readable code (JHR-XXXXXX). After a successful decode the
/// screen pops with the value; the caller resolves it to a delivery row
/// via [DeliveryApi.lookupByCode].
class QrScannerScreen extends StatefulWidget {
  const QrScannerScreen({super.key, required this.onScanned});

  /// Invoked with the decoded code. Caller is responsible for pushing
  /// the next screen (confirm sheet).
  final void Function(String code) onScanned;

  @override
  State<QrScannerScreen> createState() => _QrScannerScreenState();
}

class _QrScannerScreenState extends State<QrScannerScreen> {
  final MobileScannerController _controller = MobileScannerController(
    formats: const [BarcodeFormat.qrCode],
    detectionSpeed: DetectionSpeed.noDuplicates,
  );
  bool _emitted = false;

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _onDetect(BarcodeCapture cap) {
    if (_emitted) return;
    for (final code in cap.barcodes) {
      final raw = code.rawValue?.trim();
      if (raw == null || raw.isEmpty) continue;
      _emitted = true;
      // Haptic + auto-close
      Navigator.of(context).pop();
      widget.onScanned(raw);
      return;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      body: SafeArea(
        child: Stack(
          children: [
            MobileScanner(
              controller: _controller,
              onDetect: _onDetect,
              errorBuilder: (context, error, _) {
                return Center(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Text(
                      'Camera error: ${error.errorCode.name}',
                      style: const TextStyle(color: Colors.white),
                      textAlign: TextAlign.center,
                    ),
                  ),
                );
              },
            ),
            // Reticle
            Center(
              child: Container(
                width: 240,
                height: 240,
                decoration: BoxDecoration(
                  borderRadius: BorderRadius.circular(20),
                  border: Border.all(color: Colors.white.withOpacity(0.4)),
                ),
                child: Stack(
                  children: [
                    Positioned.fill(child: CustomPaint(painter: _CornerBracketPainter())),
                  ],
                ),
              ),
            ),
            // Title bar
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
                    style: TextStyle(color: Colors.white.withOpacity(0.7), fontSize: 12),
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
            // Torch
            Positioned(
              top: 8,
              right: 8,
              child: IconButton(
                onPressed: () => _controller.toggleTorch(),
                icon: const Icon(Icons.flash_on_rounded, color: Colors.white),
              ),
            ),
            // Dev-only simulate scan (release builds don't ship this).
            if (kDebugMode)
              Positioned(
                bottom: 32,
                left: 24,
                right: 24,
                child: SizedBox(
                  height: 48,
                  child: OutlinedButton(
                    onPressed: () {
                      if (_emitted) return;
                      _emitted = true;
                      Navigator.of(context).pop();
                      widget.onScanned('JHR-100455');
                    },
                    style: OutlinedButton.styleFrom(
                      foregroundColor: Colors.white,
                      side: const BorderSide(color: Colors.white54),
                    ),
                    child: const Text('Simulate scan (dev)'),
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

    canvas.drawLine(const Offset(0, 0), const Offset(len, 0), paint);
    canvas.drawLine(const Offset(0, 0), const Offset(0, len), paint);
    canvas.drawLine(Offset(size.width, 0), Offset(size.width - len, 0), paint);
    canvas.drawLine(Offset(size.width, 0), Offset(size.width, len), paint);
    canvas.drawLine(Offset(0, size.height), Offset(len, size.height), paint);
    canvas.drawLine(Offset(0, size.height), Offset(0, size.height - len), paint);
    canvas.drawLine(Offset(size.width, size.height),
        Offset(size.width - len, size.height), paint);
    canvas.drawLine(Offset(size.width, size.height),
        Offset(size.width, size.height - len), paint);
  }

  @override
  bool shouldRepaint(covariant CustomPainter oldDelegate) => false;
}
