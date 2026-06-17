import { Platform } from 'react-native';

/**
 * JWT key for the token store. On native we use expo-secure-store (Keychain /
 * Keystore), imported LAZILY so its native-module access never runs on web
 * (where it would throw at import). On web we fall back to localStorage so the
 * `expo start --web` preview still boots and logs in. Single source of truth:
 * the auth store writes, the axios interceptor reads.
 */
const JWT_KEY = 'jharanai_exec_jwt';

const isWeb = Platform.OS === 'web';

function webStore(): {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
} | null {
  const g = globalThis as { localStorage?: ReturnType<typeof webStore> };
  return g.localStorage ?? null;
}

export const tokenStore = {
  async read(): Promise<string | null> {
    if (isWeb) return webStore()?.getItem(JWT_KEY) ?? null;
    const SecureStore = await import('expo-secure-store');
    return SecureStore.getItemAsync(JWT_KEY);
  },
  async write(token: string): Promise<void> {
    if (isWeb) {
      webStore()?.setItem(JWT_KEY, token);
      return;
    }
    const SecureStore = await import('expo-secure-store');
    await SecureStore.setItemAsync(JWT_KEY, token);
  },
  async clear(): Promise<void> {
    if (isWeb) {
      webStore()?.removeItem(JWT_KEY);
      return;
    }
    const SecureStore = await import('expo-secure-store');
    await SecureStore.deleteItemAsync(JWT_KEY);
  },
};
