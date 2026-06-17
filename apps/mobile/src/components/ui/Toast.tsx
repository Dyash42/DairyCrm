import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors } from '@/theme/tokens';
import { ToastVariant, useToastStore } from '@/state/toastStore';
import { AppText } from './Text';

const BG: Record<ToastVariant, string> = {
  info: colors.brand,
  success: colors.successDark,
  warning: colors.warningDark,
  danger: colors.dangerDark,
};

/** App-wide toast overlay. Rendered once near the root so it floats above
 *  every screen. Replaces Flutter's ScaffoldMessenger SnackBars. */
export function Toast() {
  const insets = useSafeAreaInsets();
  const { message, variant, visible } = useToastStore();

  if (!visible) return null;

  return (
    <View style={[styles.wrap, { bottom: insets.bottom + 24 }]} pointerEvents="none">
      <View style={[styles.toast, { backgroundColor: BG[variant] }]}>
        <AppText style={styles.text}>{message}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toast: {
    maxWidth: '100%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
  },
  text: { color: colors.white, fontSize: 13, fontWeight: '500' },
});
