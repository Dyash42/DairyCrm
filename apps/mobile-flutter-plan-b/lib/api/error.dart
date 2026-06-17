import 'package:dio/dio.dart';

/// Structured API error — every UI surface checks `kind` and shows the
/// right message. Avoids stringly-typed error handling spread across screens.
enum ApiErrorKind {
  network, // no internet, DNS, etc.
  timeout,
  unauthorized, // 401 — auth gone bad, force re-login
  forbidden, // 403
  notFound, // 404
  validation, // 422
  conflict, // 409
  server, // 5xx
  unknown,
}

class ApiException implements Exception {
  ApiException({
    required this.kind,
    required this.message,
    this.statusCode,
    this.details,
  });

  final ApiErrorKind kind;
  final String message;
  final int? statusCode;
  final Object? details;

  factory ApiException.from(DioException e) {
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.sendTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return ApiException(kind: ApiErrorKind.timeout, message: 'Request timed out');
    }
    if (e.type == DioExceptionType.connectionError) {
      return ApiException(kind: ApiErrorKind.network, message: 'No internet');
    }

    final status = e.response?.statusCode ?? 0;
    final payload = e.response?.data;
    final serverMessage =
        (payload is Map && payload['message'] is String) ? payload['message'] as String : null;

    final kind = switch (status) {
      401 => ApiErrorKind.unauthorized,
      403 => ApiErrorKind.forbidden,
      404 => ApiErrorKind.notFound,
      409 => ApiErrorKind.conflict,
      422 => ApiErrorKind.validation,
      >= 500 => ApiErrorKind.server,
      _ => ApiErrorKind.unknown,
    };

    return ApiException(
      kind: kind,
      message: serverMessage ?? 'Request failed ($status)',
      statusCode: status,
      details: payload,
    );
  }

  @override
  String toString() => 'ApiException($kind, $statusCode): $message';
}
