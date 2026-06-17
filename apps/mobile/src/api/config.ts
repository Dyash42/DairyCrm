/**
 * API configuration. The base URL is read from Expo's public env at bundle
 * time so it can change per environment (dev -> staging -> prod) without a
 * code change:
 *
 *   EXPO_PUBLIC_API_BASE=https://api.jharanai.com npx expo start
 *
 * Defaults to the Android-emulator host loopback on port 3000.
 */
export const API_BASE: string =
  process.env.EXPO_PUBLIC_API_BASE ?? 'http://10.0.2.2:3000';

/** Connect / receive timeout (axios uses a single `timeout`; we take the larger). */
export const REQUEST_TIMEOUT_MS = 12_000;
