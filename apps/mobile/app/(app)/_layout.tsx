import { Stack } from 'expo-router';

import { colors } from '@/theme/tokens';

export default function AppLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.surface },
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { fontFamily: 'Inter_600SemiBold' },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="route" options={{ headerShown: false }} />
      <Stack.Screen name="scan" options={{ headerShown: false, animation: 'fade' }} />
      <Stack.Screen name="end-of-day" options={{ title: 'End of day' }} />
      <Stack.Screen name="profile" options={{ title: 'Account' }} />
      <Stack.Screen name="help" options={{ title: 'How to use the app' }} />
    </Stack>
  );
}
