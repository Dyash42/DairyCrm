import axios, {
  type AxiosError,
  type AxiosInstance,
  type InternalAxiosRequestConfig,
} from 'axios';

import { API_BASE, REQUEST_TIMEOUT_MS } from './config';
import { ApiError } from './errors';
import { tokenStore } from './tokenStore';

/**
 * The /auth/* paths that DON'T need a token. Everything else under /auth/*
 * (notably /auth/me, which validates an existing token on cold start) MUST
 * send Authorization. This mirrors the Flutter Dio interceptor: a naive
 * prefix-match used to wipe the token on every cold start because /auth/me
 * went out unauthenticated, got 401, and the error interceptor cleared it.
 */
const UNAUTHENTICATED_PATHS = new Set<string>([
  '/auth/admin/login',
  '/auth/executive/otp/request',
  '/auth/executive/otp/verify',
]);

function needsAuth(url: string | undefined): boolean {
  if (!url) return true;
  return !UNAUTHENTICATED_PATHS.has(url);
}

function buildClient(): AxiosInstance {
  const instance = axios.create({
    baseURL: API_BASE,
    timeout: REQUEST_TIMEOUT_MS,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
  });

  // Inject the JWT on authenticated requests.
  instance.interceptors.request.use(
    async (config: InternalAxiosRequestConfig) => {
      if (needsAuth(config.url)) {
        const token = await tokenStore.read();
        if (token) {
          config.headers.set('Authorization', `Bearer ${token}`);
        }
      }
      return config;
    },
  );

  // Map all errors to ApiError, and purge the token on 401 so the UI lands
  // back on login. Skipped for the unauthenticated endpoints (a 401 from the
  // OTP-request endpoint shouldn't clear an unrelated token).
  instance.interceptors.response.use(
    (res) => res,
    async (error: AxiosError) => {
      const path = error.config?.url;
      if (error.response?.status === 401 && needsAuth(path)) {
        await tokenStore.clear();
      }
      return Promise.reject(ApiError.fromAxios(error));
    },
  );

  return instance;
}

/** Shared axios instance used by every API module. */
export const api = buildClient();
