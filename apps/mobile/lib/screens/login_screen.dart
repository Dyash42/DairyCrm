import 'package:flutter/material.dart';

import '../theme/tokens.dart';
import 'todays_route_screen.dart';

/// Phone + OTP login.
///
/// Real flow: send OTP via Meta WhatsApp Authentication template OR SMS,
/// verify on backend, store JWT in flutter_secure_storage.
/// For now: enter anything → land on Today's Route.
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  bool _otpSent = false;
  bool _loading = false;

  @override
  void dispose() {
    _phone.dispose();
    _otp.dispose();
    super.dispose();
  }

  Future<void> _requestOtp() async {
    if (_phone.text.length < 10) {
      _toast('Enter a valid 10-digit phone number');
      return;
    }
    setState(() => _loading = true);
    await Future<void>.delayed(const Duration(milliseconds: 600));
    setState(() {
      _loading = false;
      _otpSent = true;
    });
  }

  Future<void> _verify() async {
    if (_otp.text.length < 4) {
      _toast('Enter the OTP');
      return;
    }
    setState(() => _loading = true);
    await Future<void>.delayed(const Duration(milliseconds: 400));
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute<void>(builder: (_) => const TodaysRouteScreen()),
    );
  }

  void _toast(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: JharanaiTokens.bg,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              // Logo block
              Center(
                child: Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: JharanaiTokens.brand,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Icon(
                    Icons.water_drop_rounded,
                    color: Colors.white,
                    size: 32,
                  ),
                ),
              ),
              const SizedBox(height: 16),
              const Center(
                child: Text(
                  'Jharanai',
                  style: TextStyle(
                    fontSize: 24,
                    fontWeight: FontWeight.w700,
                    color: JharanaiTokens.textPrimary,
                  ),
                ),
              ),
              const SizedBox(height: 4),
              const Center(
                child: Text(
                  'Delivery partner',
                  style: TextStyle(
                    fontSize: 14,
                    color: JharanaiTokens.textSecondary,
                  ),
                ),
              ),
              const SizedBox(height: 48),
              Text(
                _otpSent ? 'Enter OTP' : 'Phone number',
                style: const TextStyle(
                  fontSize: 13,
                  color: JharanaiTokens.textSecondary,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const SizedBox(height: 8),
              if (!_otpSent)
                TextField(
                  controller: _phone,
                  keyboardType: TextInputType.phone,
                  decoration: _inputDeco(prefix: '+91'),
                  style: const TextStyle(fontSize: 17),
                )
              else
                TextField(
                  controller: _otp,
                  keyboardType: TextInputType.number,
                  maxLength: 6,
                  decoration: _inputDeco().copyWith(counterText: ''),
                  style: const TextStyle(
                    fontSize: 22,
                    letterSpacing: 8,
                    fontWeight: FontWeight.w600,
                  ),
                  textAlign: TextAlign.center,
                ),
              const SizedBox(height: 24),
              SizedBox(
                height: 52,
                child: ElevatedButton(
                  onPressed: _loading
                      ? null
                      : (_otpSent ? _verify : _requestOtp),
                  child: _loading
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(
                            strokeWidth: 2,
                            color: Colors.white,
                          ),
                        )
                      : Text(_otpSent ? 'Verify and continue' : 'Get OTP'),
                ),
              ),
              if (_otpSent) ...[
                const SizedBox(height: 12),
                Center(
                  child: TextButton(
                    onPressed: () => setState(() => _otpSent = false),
                    child: const Text('Use a different number'),
                  ),
                ),
              ],
              const Spacer(flex: 2),
              const Center(
                child: Text(
                  'Internal app · For Jharanai sales executives only',
                  style: TextStyle(
                    fontSize: 11,
                    color: JharanaiTokens.textMuted,
                  ),
                ),
              ),
              const SizedBox(height: 16),
            ],
          ),
        ),
      ),
    );
  }

  InputDecoration _inputDeco({String? prefix}) {
    return InputDecoration(
      prefixText: prefix == null ? null : '$prefix ',
      prefixStyle: const TextStyle(
        fontSize: 17,
        color: JharanaiTokens.textSecondary,
      ),
      filled: true,
      fillColor: JharanaiTokens.surface,
      contentPadding:
          const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      border: OutlineInputBorder(
        borderRadius: BorderRadius.circular(JharanaiTokens.radiusLg),
        borderSide: const BorderSide(color: JharanaiTokens.border),
      ),
      enabledBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(JharanaiTokens.radiusLg),
        borderSide: const BorderSide(color: JharanaiTokens.border),
      ),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(JharanaiTokens.radiusLg),
        borderSide: const BorderSide(color: JharanaiTokens.brand, width: 2),
      ),
    );
  }
}
