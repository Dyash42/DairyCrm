import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/error.dart';
import '../auth/auth_provider.dart';
import '../theme/tokens.dart';

/// Two-step login:
///   1. Phone → POST /auth/executive/otp/request
///   2. OTP   → POST /auth/executive/otp/verify  → JWT
///
/// After successful verify, AuthController flips state to AuthSignedIn
/// and the router widget switches to TodaysRouteScreen. We do NOT
/// Navigator.push here — the routing layer reacts to auth state.
class LoginScreen extends ConsumerStatefulWidget {
  const LoginScreen({super.key});

  @override
  ConsumerState<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends ConsumerState<LoginScreen> {
  final _phone = TextEditingController();
  final _otp = TextEditingController();
  bool _otpSent = false;
  bool _loading = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    _otp.dispose();
    super.dispose();
  }

  Future<void> _requestOtp() async {
    if (_phone.text.replaceAll(RegExp(r'\D'), '').length < 10) {
      setState(() => _error = 'Enter a valid 10-digit phone number');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authStateProvider.notifier).requestOtp(_phone.text.trim());
      setState(() => _otpSent = true);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('OTP sent if your phone is registered'),
          backgroundColor: JharanaiTokens.brand,
        ),
      );
    } on ApiException catch (e) {
      setState(() => _error = _messageFor(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  Future<void> _verify() async {
    if (_otp.text.length < 4) {
      setState(() => _error = 'Enter the OTP');
      return;
    }
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      await ref.read(authStateProvider.notifier).verifyOtp(
            phone: _phone.text.trim(),
            code: _otp.text.trim(),
          );
      // Routing reacts to AuthSignedIn; nothing else to do.
    } on ApiException catch (e) {
      setState(() => _error = _messageFor(e));
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _messageFor(ApiException e) {
    switch (e.kind) {
      case ApiErrorKind.unauthorized:
        return 'Wrong or expired OTP. Try again.';
      case ApiErrorKind.network:
        return 'No internet. Check your connection.';
      case ApiErrorKind.timeout:
        return 'Server did not respond. Try again.';
      case ApiErrorKind.validation:
        return 'Please check what you entered.';
      default:
        return e.message;
    }
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
              Center(
                child: Container(
                  width: 64,
                  height: 64,
                  decoration: BoxDecoration(
                    color: JharanaiTokens.brand,
                    borderRadius: BorderRadius.circular(20),
                  ),
                  child: const Icon(Icons.water_drop_rounded, color: Colors.white, size: 32),
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
                  style: TextStyle(fontSize: 14, color: JharanaiTokens.textSecondary),
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
              if (_error != null) ...[
                const SizedBox(height: 8),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                  decoration: BoxDecoration(
                    color: JharanaiTokens.dangerLight,
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Text(
                    _error!,
                    style: const TextStyle(color: JharanaiTokens.dangerDark, fontSize: 13),
                  ),
                ),
              ],
              const SizedBox(height: 24),
              SizedBox(
                height: 52,
                child: ElevatedButton(
                  onPressed: _loading ? null : (_otpSent ? _verify : _requestOtp),
                  child: _loading
                      ? const SizedBox(
                          width: 22,
                          height: 22,
                          child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white),
                        )
                      : Text(_otpSent ? 'Verify and continue' : 'Get OTP'),
                ),
              ),
              if (_otpSent) ...[
                const SizedBox(height: 12),
                Center(
                  child: TextButton(
                    onPressed: () => setState(() {
                      _otpSent = false;
                      _otp.clear();
                      _error = null;
                    }),
                    child: const Text('Use a different number'),
                  ),
                ),
              ],
              const Spacer(flex: 2),
              const Center(
                child: Text(
                  'Internal app · For Jharanai sales executives only',
                  style: TextStyle(fontSize: 11, color: JharanaiTokens.textMuted),
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
      prefixStyle: const TextStyle(fontSize: 17, color: JharanaiTokens.textSecondary),
      filled: true,
      fillColor: JharanaiTokens.surface,
      contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
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
