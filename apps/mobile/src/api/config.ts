/**
 * API configuration. The base URL is read from Expo's public env at bundle
 * time so it can change per environment (dev -> staging -> prod) without a
 * code change:
 *
 *   EXPO_PUBLIC_API_BASE=https://api.jharanai.com npx expo start
 *
 * INT-07: the Android-emulator loopback is ONLY a __DEV__ convenience. A
 * release build that shipped without EXPO_PUBLIC_API_BASE would otherwise bake
 * in `10.0.2.2:3000` — unreachable on a real device, so every call fails and
 * the offline queue fills but never drains. In a release build we therefore
 * fail loud at startup unless a real https base is configured.
 */
const configuredBase = process.env.EXPO_PUBLIC_API_BASE;

if (!__DEV__) {
  if (!configuredBase) {
    throw new Error(
      'EXPO_PUBLIC_API_BASE must be set for a release build (no emulator-loopback fallback in production).',
    );
  }
  if (!/^https:\/\//i.test(configuredBase)) {
    throw new Error(
      'EXPO_PUBLIC_API_BASE must use https in production — JWTs and customer PII must not travel in cleartext.',
    );
  }
}

export const API_BASE: string = configuredBase ?? 'http://10.0.2.2:3000';

/** Connect / receive timeout (axios uses a single `timeout`; we take the larger). */
export const REQUEST_TIMEOUT_MS = 12_000;
