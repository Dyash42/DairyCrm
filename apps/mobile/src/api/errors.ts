import type { AxiosError } from 'axios';

/**
 * Structured API error — every UI surface checks `kind` and shows the right
 * message. Port of the Flutter app's ApiException, so error handling is not
 * stringly-typed and spread across screens.
 */
export type ApiErrorKind =
  | 'network' // no internet, DNS, etc.
  | 'timeout'
  | 'unauthorized' // 401 — auth gone bad, force re-login
  | 'forbidden' // 403
  | 'notFound' // 404
  | 'validation' // 422
  | 'conflict' // 409
  | 'server' // 5xx
  | 'unknown';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly statusCode?: number;
  readonly details?: unknown;

  constructor(
    kind: ApiErrorKind,
    message: string,
    statusCode?: number,
    details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
    this.kind = kind;
    this.statusCode = statusCode;
    this.details = details;
  }

  static fromAxios(e: AxiosError): ApiError {
    // Timeouts.
    if (e.code === 'ECONNABORTED' || e.code === 'ETIMEDOUT') {
      return new ApiError('timeout', 'Request timed out');
    }
    // No response at all -> connection-level failure.
    if (!e.response) {
      return new ApiError('network', 'No internet');
    }

    const status = e.response.status;
    const payload = e.response.data as unknown;
    const serverMessage =
      payload && typeof payload === 'object' && 'message' in payload &&
      typeof (payload as { message: unknown }).message === 'string'
        ? (payload as { message: string }).message
        : undefined;

    let kind: ApiErrorKind;
    switch (status) {
      case 401:
        kind = 'unauthorized';
        break;
      case 403:
        kind = 'forbidden';
        break;
      case 404:
        kind = 'notFound';
        break;
      case 409:
        kind = 'conflict';
        break;
      case 422:
        kind = 'validation';
        break;
      default:
        kind = status >= 500 ? 'server' : 'unknown';
    }

    return new ApiError(
      kind,
      serverMessage ?? `Request failed (${status})`,
      status,
      payload,
    );
  }
}

/** Type guard used by screens that catch unknown errors. */
export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}
