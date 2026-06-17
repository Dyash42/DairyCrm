/// API configuration — override at build time:
///
///   flutter run --dart-define=API_BASE=https://api.jharanai.com
///
/// Defaults match the dev backend on port 3000. The mobile app is the
/// milkman's primary client, so the URL has to be configurable per
/// environment (dev → staging → prod) without code changes.
class ApiConfig {
  ApiConfig._();

  /// Base URL for every REST call. No trailing slash.
  static const String baseUrl = String.fromEnvironment(
    'API_BASE',
    defaultValue: 'http://10.0.2.2:3000',
  );

  /// Connect / receive timeouts.
  static const Duration connectTimeout = Duration(seconds: 8);
  static const Duration receiveTimeout = Duration(seconds: 12);

  /// How long an inbound QR scan is considered "fresh" before the
  /// confirm sheet should warn it might be stale.
  static const Duration scanFreshness = Duration(minutes: 2);
}
