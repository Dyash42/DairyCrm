import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from '@expo-google-fonts/inter';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Toast } from '@/components/ui/Toast';
import { useAuthStore } from '@/state/authStore';
import { useNetworkStore } from '@/state/networkStore';
import { useSyncStore } from '@/state/syncStore';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync().catch(() => {
  /* ignore — best effort */
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  const status = useAuthStore((s) => s.status);
  const segments = useSegments();
  const router = useRouter();

  // One-time bootstrap of auth + connectivity + offline sync engine.
  useEffect(() => {
    void useAuthStore.getState().bootstrap();
    useNetworkStore.getState().init();
    void useSyncStore.getState().init();
  }, []);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => undefined);
    }
  }, [fontsLoaded, fontError]);

  // Auth gate: bounce between the authed stack and /login as state changes.
  // Only runs once the navigator is mounted (fonts resolved) and auth is known.
  useEffect(() => {
    if (status === 'unknown') return;
    if (!fontsLoaded && !fontError) return;
    const seg = segments[0];
    const inApp = seg === '(app)';
    if (status === 'signedOut' && seg !== 'login') {
      router.replace('/login');
    } else if (status === 'needsPin' && seg !== 'enter-pin') {
      router.replace('/enter-pin');
    } else if (status === 'needsPinSetup' && seg !== 'create-pin') {
      router.replace('/create-pin');
    } else if (status === 'signedIn' && !inApp) {
      router.replace('/route');
    }
  }, [status, segments, router, fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null; // keep the native splash visible
  }

  return (
    <SafeAreaProvider>
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="enter-pin" />
          <Stack.Screen name="create-pin" />
          <Stack.Screen name="(app)" />
        </Stack>
        <Toast />
        <StatusBar style="dark" />
      </View>
    </SafeAreaProvider>
  );
}
