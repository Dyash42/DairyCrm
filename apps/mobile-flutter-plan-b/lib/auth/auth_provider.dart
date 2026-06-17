import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../api/auth_api.dart';
import '../api/client.dart';
import '../api/error.dart';

/// Auth state lifecycle:
///
///   unknown   ← app boot, before we check storage
///     │
///     ▼
///   signedOut ↔ signedIn(user)
///
/// Login screens watch `authStateProvider`; routing logic in main.dart
/// switches between LoginScreen and TodaysRouteScreen based on it.
sealed class AuthState {
  const AuthState();
}

class AuthUnknown extends AuthState {
  const AuthUnknown();
}

class AuthSignedOut extends AuthState {
  const AuthSignedOut({this.lastError});
  final String? lastError;
}

class AuthSignedIn extends AuthState {
  const AuthSignedIn(this.user);
  final AuthUser user;
}

class AuthController extends StateNotifier<AuthState> {
  AuthController(this._ref) : super(const AuthUnknown()) {
    _bootstrap();
  }

  final Ref _ref;

  TokenStore get _store => _ref.read(tokenStoreProvider);
  AuthApi get _api => AuthApi(_ref.read(apiClientProvider));

  /// On app boot: try the cached JWT against /auth/me. If it works, we're
  /// signed in. If 401, we wipe and show login.
  Future<void> _bootstrap() async {
    final token = await _store.read();
    if (token == null || token.isEmpty) {
      state = const AuthSignedOut();
      return;
    }
    try {
      final me = await _api.me();
      state = AuthSignedIn(me);
    } on ApiException catch (e) {
      if (e.kind == ApiErrorKind.unauthorized) {
        await _store.clear();
        state = const AuthSignedOut();
      } else {
        // Network error / server down — keep the cached state. We trust
        // the persisted token until proven invalid by a 401.
        state = const AuthSignedOut(lastError: 'Could not reach server');
      }
    }
  }

  /// Step 1 of login: ask the server to send an OTP. Always resolves —
  /// the server doesn't leak whether the phone is registered.
  Future<void> requestOtp(String phone) async {
    await _api.requestOtp(phone);
  }

  /// Step 2 of login: verify the OTP. On success, persist token + flip
  /// state to AuthSignedIn.
  Future<void> verifyOtp({required String phone, required String code}) async {
    final r = await _api.verifyOtp(phone: phone, code: code);
    await _store.write(r.token);
    state = AuthSignedIn(r.user);
  }

  Future<void> signOut() async {
    await _store.clear();
    state = const AuthSignedOut();
  }
}

final authStateProvider = StateNotifierProvider<AuthController, AuthState>(
  (ref) => AuthController(ref),
);

/// Convenience: read the current user or null.
final currentUserProvider = Provider<AuthUser?>((ref) {
  final s = ref.watch(authStateProvider);
  return s is AuthSignedIn ? s.user : null;
});
