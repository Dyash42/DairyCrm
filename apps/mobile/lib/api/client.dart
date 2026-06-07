import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

import 'config.dart';
import 'error.dart';

/// JWT key for flutter_secure_storage. Single source of truth — auth
/// repository writes, interceptor reads. No widget should ever touch it.
const String kJwtKey = 'jharanai_exec_jwt';

/// Configurable secure-storage wrapper. Kept behind a tiny abstraction so
/// tests can swap it out.
class TokenStore {
  TokenStore([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  Future<String?> read() => _storage.read(key: kJwtKey);
  Future<void> write(String token) => _storage.write(key: kJwtKey, value: token);
  Future<void> clear() => _storage.delete(key: kJwtKey);
}

/// Build a Dio with JWT injection + standardised error mapping.
///
/// We expose a single shared instance via [apiClientProvider] so every API
/// helper consumes the same auth pipeline. Tests can override the provider
/// to inject a mock.
Dio buildDio({required TokenStore tokenStore}) {
  final dio = Dio(
    BaseOptions(
      baseUrl: ApiConfig.baseUrl,
      connectTimeout: ApiConfig.connectTimeout,
      receiveTimeout: ApiConfig.receiveTimeout,
      headers: {'Accept': 'application/json'},
      contentType: 'application/json',
      // Don't throw on 4xx — let our interceptor map cleanly.
      validateStatus: (s) => s != null && s >= 200 && s < 300,
    ),
  );

  // The /auth/* paths that DON'T need a token. Everything else under
  // /auth/* (notably /auth/me, which validates an existing token on cold
  // start) MUST send Authorization. The previous prefix-match wiped the
  // token on every cold start because /auth/me went out unauthenticated,
  // got 401, and the error interceptor cleared the token.
  const unauthenticatedPaths = <String>{
    '/auth/admin/login',
    '/auth/executive/otp/request',
    '/auth/executive/otp/verify',
  };

  dio.interceptors.add(InterceptorsWrapper(
    onRequest: (options, handler) async {
      final needsAuth = !unauthenticatedPaths.contains(options.path);
      if (needsAuth) {
        final token = await tokenStore.read();
        if (token != null && token.isNotEmpty) {
          options.headers['Authorization'] = 'Bearer $token';
        }
      }
      handler.next(options);
    },
    onError: (e, handler) async {
      // 401 — purge token so the UI lands back on login. Skipped for the
      // OTP-request endpoint which can legitimately return 401 when the
      // phone isn't registered (we don't want to clear an unrelated token).
      final path = e.requestOptions.path;
      if (e.response?.statusCode == 401 &&
          !unauthenticatedPaths.contains(path)) {
        await tokenStore.clear();
      }
      handler.next(e);
    },
  ));

  return dio;
}

/// Convert Dio errors into our typed [ApiException] at the call site.
Future<T> mapApi<T>(Future<T> Function() body) async {
  try {
    return await body();
  } on DioException catch (e) {
    throw ApiException.from(e);
  }
}

// ---------------------- Riverpod providers ----------------------

final tokenStoreProvider = Provider<TokenStore>((_) => TokenStore());

final apiClientProvider = Provider<Dio>((ref) {
  final store = ref.watch(tokenStoreProvider);
  return buildDio(tokenStore: store);
});
