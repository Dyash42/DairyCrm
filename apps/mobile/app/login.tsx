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

import { AppText } from '@/components/ui/Text';
import { ApiError, isApiError } from '@/api/errors';
import { useAuthStore } from '@/state/authStore';
import { toast } from '@/state/toastStore';
import { colors, radius } from '@/theme/tokens';

/**
 * Two-step login (port of login_screen.dart):
 *   1. Phone -> POST /auth/executive/otp/request
 *   2. OTP   -> POST /auth/executive/otp/verify -> JWT
 * After verify, the auth store flips to signedIn and the root gate routes
 * to the authenticated stack — we don't navigate imperatively here.
 */
export default function LoginScreen() {
  const requestOtp = useAuthStore((s) => s.requestOtp);
  const verifyOtp = useAuthStore((s) => s.verifyOtp);

  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const messageFor = (e: ApiError): string => {
    switch (e.kind) {
      case 'unauthorized':
        return 'Wrong or expired OTP. Try again.';
      case 'network':
        return 'No internet. Check your connection.';
      case 'timeout':
        return 'Server did not respond. Try again.';
      case 'validation':
        return 'Please check what you entered.';
      default:
        return e.message;
    }
  };

  const handleRequestOtp = async () => {
    if (phone.replace(/\D/g, '').length < 10) {
      setError('Enter a valid 10-digit phone number');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await requestOtp(phone.trim());
      setOtpSent(true);
      toast.info('OTP sent if your phone is registered');
    } catch (e) {
      setError(isApiError(e) ? messageFor(e) : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (otp.length < 4) {
      setError('Enter the OTP');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await verifyOtp(phone.trim(), otp.trim());
      // Routing reacts to signedIn; nothing else to do.
    } catch (e) {
      setError(isApiError(e) ? messageFor(e) : 'Something went wrong');
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
            <Ionicons name="water" size={32} color={colors.white} />
          </View>
          <AppText style={styles.brand}>Jharanai</AppText>
          <AppText style={styles.tagline}>Delivery partner</AppText>

          <View style={{ height: 48 }} />
          <AppText style={styles.fieldLabel}>
            {otpSent ? 'Enter OTP' : 'Phone number'}
          </AppText>

          {!otpSent ? (
            <View style={styles.inputWrap}>
              <AppText style={styles.prefix}>+91</AppText>
              <TextInput
                value={phone}
                onChangeText={setPhone}
                keyboardType="phone-pad"
                placeholder="98765 43210"
                placeholderTextColor={colors.textMuted}
                style={styles.input}
              />
            </View>
          ) : (
            <View style={styles.inputWrap}>
              <TextInput
                value={otp}
                onChangeText={setOtp}
                keyboardType="number-pad"
                maxLength={6}
                style={[styles.input, styles.otpInput]}
                textAlign="center"
              />
            </View>
          )}

          {error ? (
            <View style={styles.errorBox}>
              <AppText style={styles.errorText}>{error}</AppText>
            </View>
          ) : null}

          <Pressable
            disabled={loading}
            onPress={otpSent ? handleVerify : handleRequestOtp}
            style={({ pressed }) => [
              styles.button,
              (pressed || loading) && { opacity: 0.85 },
            ]}
          >
            {loading ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <AppText style={styles.buttonText}>
                {otpSent ? 'Verify and continue' : 'Get OTP'}
              </AppText>
            )}
          </Pressable>

          {otpSent ? (
            <Pressable
              onPress={() => {
                setOtpSent(false);
                setOtp('');
                setError(null);
              }}
              style={styles.linkBtn}
            >
              <AppText style={styles.link}>Use a different number</AppText>
            </Pressable>
          ) : null}

          <View style={styles.flexSpacer2} />
          <AppText style={styles.footer}>
            Internal app · For Jharanai sales executives only
          </AppText>
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
  brand: { textAlign: 'center', fontSize: 24, fontWeight: '700', marginTop: 16 },
  tagline: { textAlign: 'center', fontSize: 14, color: colors.textSecondary, marginTop: 4 },
  fieldLabel: { fontSize: 13, color: colors.textSecondary, fontWeight: '500', marginBottom: 8 },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
  },
  prefix: { fontSize: 17, color: colors.textSecondary, marginRight: 6 },
  input: { flex: 1, fontSize: 17, paddingVertical: 14, color: colors.textPrimary },
  otpInput: { fontSize: 22, letterSpacing: 8, fontWeight: '600' },
  errorBox: {
    marginTop: 8,
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
  linkBtn: { alignSelf: 'center', marginTop: 12, padding: 8 },
  link: { color: colors.brand, fontSize: 14, fontWeight: '500' },
  footer: { textAlign: 'center', fontSize: 11, color: colors.textMuted, marginBottom: 16 },
});
