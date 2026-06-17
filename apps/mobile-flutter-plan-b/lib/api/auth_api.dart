import 'package:dio/dio.dart';

import 'client.dart';

class AuthUser {
  AuthUser({required this.id, required this.name, required this.role});

  final String id;
  final String name;
  final String role;

  factory AuthUser.fromJson(Map<String, dynamic> j) => AuthUser(
        id: (j['id'] ?? j['sub'] ?? '').toString(),
        name: (j['name'] ?? '').toString(),
        role: (j['role'] ?? '').toString(),
      );
}

class AuthApi {
  AuthApi(this._dio);

  final Dio _dio;

  /// Triggers an OTP send. Server may return 200 even for unknown phones
  /// (so we don't leak which numbers are registered). UI should display
  /// "if your number is registered, you'll receive an OTP".
  Future<void> requestOtp(String phone) {
    return mapApi(() async {
      await _dio.post('/auth/executive/otp/request', data: {'phone': phone});
    });
  }

  /// Verifies the OTP. On success returns the JWT and user.
  Future<({String token, AuthUser user})> verifyOtp({
    required String phone,
    required String code,
  }) {
    return mapApi(() async {
      final res = await _dio.post(
        '/auth/executive/otp/verify',
        data: {'phone': phone, 'code': code},
      );
      final data = res.data as Map<String, dynamic>;
      return (
        token: data['token'] as String,
        user: AuthUser.fromJson(data['user'] as Map<String, dynamic>),
      );
    });
  }

  /// Read the logged-in user from the server (used to validate the cached
  /// JWT on app start).
  Future<AuthUser> me() {
    return mapApi(() async {
      final res = await _dio.get('/auth/me');
      final data = res.data as Map<String, dynamic>;
      return AuthUser.fromJson(data['user'] as Map<String, dynamic>);
    });
  }
}
