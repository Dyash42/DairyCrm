import { Platform } from 'react-native';

/**
 * Secure local storage. On native we use expo-secure-store (Keychain /
 * Keystore), imported LAZILY so its native-module access never runs on web
 * (where it would throw at import). On web we fall back to localStorage so the
 * `expo start --web` preview still boots and logs in.
 *
 * Stores:
 *   - the executive JWT (axios interceptor reads it)
 *   - the "PIN phone": when set, the app has a PIN configured and unlocks with
 *     the local PIN (via /auth/executive/pin/verify) instead of requesting an
 *     OTP on every launch. Cleared on sign-out / "use OTP instead".
 */
const JWT_KEY = 'jharanai_exec_jwt';
const PIN_PHONE_KEY = 'jharanai_exec_pin_phone';

const isWeb = Platform.OS === 'web';

function webStore(): {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
} | null {
  const g = globalThis as { localStorage?: ReturnType<typeof webStore> };
  return g.localStorage ?? null;
}

async function rawGet(key: string): Promise<string | null> {
  if (isWeb) return webStore()?.getItem(key) ?? null;
  const SecureStore = await import('expo-secure-store');
  return SecureStore.getItemAsync(key);
}

async function rawSet(key: string, value: string): Promise<void> {
  if (isWeb) {
    webStore()?.setItem(key, value);
    return;
  }
  const SecureStore = await import('expo-secure-store');
  await SecureStore.setItemAsync(key, value);
}

async function rawDel(key: string): Promise<void> {
  if (isWeb) {
    webStore()?.removeItem(key);
    return;
  }
  const SecureStore = await import('expo-secure-store');
  await SecureStore.deleteItemAsync(key);
}

export const tokenStore = {
  read: (): Promise<string | null> => rawGet(JWT_KEY),
  write: (token: string): Promise<void> => rawSet(JWT_KEY, token),
  clear: (): Promise<void> => rawDel(JWT_KEY),

  /** The phone bound to the locally-configured PIN, or null if no PIN set. */
  readPinPhone: (): Promise<string | null> => rawGet(PIN_PHONE_KEY),
  writePinPhone: (phone: string): Promise<void> => rawSet(PIN_PHONE_KEY, phone),
  clearPinPhone: (): Promise<void> => rawDel(PIN_PHONE_KEY),
};
