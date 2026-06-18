import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isApiError } from '@/api/errors';
import { AppText } from '@/components/ui/Text';
import { useAuthStore } from '@/state/authStore';
import { colors, radius } from '@/theme/tokens';

const PIN_REGEX = /^(\d{4}|\d{6})$/;

/**
 * PIN unlock screen — shown on app launch when a PIN is configured (status ===
 * 'needsPin'). Verifies the PIN server-side (with lockout). "Use OTP instead"
 * falls back to the OTP login (forgot PIN / new device).
 */
export default function EnterPinScreen() {
  const verifyPin = useAuthStore((s) => s.verifyPin);
  const useOtpInstead = useAuthStore((s) => s.useOtpInstead);
  const pinPhone = useAuthStore((s) => s.pinPhone);
  const [pin, setPin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const masked = pinPhone ? `•••••${pinPhone.slice(-4)}` : '';

  const submit = async () => {
    if (!PIN_REGEX.test(pin)) {
      setError('Enter your 4- or 6-digit PIN');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await verifyPin(pin);
      // Root gate routes to the app on success.
    } catch (e) {
      setError(isApiError(e) ? e.message : 'Wrong PIN. Try again.');
      setPin('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.container}>
          <View style={styles.flexSpacer} />
          <View style={styles.logo}>
            <Ionicons name="lock-closed" size={28} color={colors.white} />
          </View>
          <AppText style={styles.title}>Enter your PIN</AppText>
          {masked ? <AppText style={styles.sub}>{masked}</AppText> : null}

          <View style={{ height: 32 }} />
          <TextInput
            value={pin}
            onChangeText={setPin}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            autoFocus
            style={styles.input}
            textAlign="center"
          />

          {error ? (
            <View style={styles.errorBox}>
              <AppText style={styles.errorText}>{error}</AppText>
            </View>
          ) : null}

          <Pressable
            disabled={loading}
            onPress={submit}
            style={({ pressed }) => [styles.button, (pressed || loading) && { opacity: 0.85 }]}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <AppText style={styles.buttonText}>Unlock</AppText>
            )}
          </Pressable>

          <Pressable onPress={() => void useOtpInstead()} style={styles.linkBtn}>
            <AppText style={styles.link}>Forgot PIN? Use OTP instead</AppText>
          </Pressable>

          <View style={styles.flexSpacer2} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, alignItems: 'stretch' },
  flexSpacer: { flex: 1 },
  flexSpacer2: { flex: 2 },
  logo: {
    alignSelf: 'center',
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { textAlign: 'center', fontSize: 22, fontWeight: '700', marginTop: 16 },
  sub: { textAlign: 'center', fontSize: 14, color: colors.textSecondary, marginTop: 6 },
  input: {
    fontSize: 22,
    letterSpacing: 8,
    fontWeight: '600',
    paddingVertical: 14,
    color: colors.textPrimary,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  errorBox: {
    marginTop: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.dangerLight,
    borderRadius: 8,
  },
  errorText: { color: colors.dangerDark, fontSize: 13 },
  button: {
    height: 52,
    marginTop: 24,
    borderRadius: radius.lg,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: colors.brandFg, fontSize: 16, fontWeight: '600' },
  linkBtn: { alignSelf: 'center', marginTop: 16, padding: 8 },
  link: { color: colors.brand, fontSize: 14, fontWeight: '500' },
});
