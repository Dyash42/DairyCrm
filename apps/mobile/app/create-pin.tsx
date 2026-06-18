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
import { toast } from '@/state/toastStore';
import { colors, radius } from '@/theme/tokens';

const PIN_REGEX = /^(\d{4}|\d{6})$/;

/**
 * Create a device-unlock PIN after first-time OTP login. Once set, the app
 * unlocks with this PIN on subsequent launches instead of an OTP. The root
 * gate routes here when status === 'needsPinSetup'.
 */
export default function CreatePinScreen() {
  const setPin = useAuthStore((s) => s.setPin);
  const [pin, setPinValue] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!PIN_REGEX.test(pin)) {
      setError('PIN must be 4 or 6 digits');
      return;
    }
    if (pin !== confirm) {
      setError('PINs do not match');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await setPin(pin);
      toast.success('PIN set — use it to unlock next time');
      // The root gate routes to the app once status flips to signedIn.
    } catch (e) {
      setError(isApiError(e) ? e.message : 'Could not set PIN. Try again.');
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
          <AppText style={styles.title}>Create a PIN</AppText>
          <AppText style={styles.sub}>
            Use this 4- or 6-digit PIN to unlock the app quickly next time.
          </AppText>

          <View style={{ height: 32 }} />
          <AppText style={styles.fieldLabel}>New PIN</AppText>
          <TextInput
            value={pin}
            onChangeText={setPinValue}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
            style={styles.input}
            textAlign="center"
          />
          <View style={{ height: 16 }} />
          <AppText style={styles.fieldLabel}>Confirm PIN</AppText>
          <TextInput
            value={confirm}
            onChangeText={setConfirm}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={6}
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
              <AppText style={styles.buttonText}>Set PIN and continue</AppText>
            )}
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
  fieldLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '500', marginBottom: 8 },
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
});
