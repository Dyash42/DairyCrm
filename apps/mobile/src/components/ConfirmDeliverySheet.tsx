import { MaterialIcons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { fmtLitres } from '@/lib/format';
import { DeliveryStop } from '@/models/delivery';
import { colors, radius } from '@/theme/tokens';
import { AppText } from './ui/Text';

/**
 * Bottom sheet shown after a QR scan (or the card tap). Lets the milkman
 * confirm the scheduled qty, edit it (partial), enter cash collected, or
 * skip. Implemented with RN's built-in Modal so the app stays Expo Go
 * compatible (no native bottom-sheet dependency). Drag-to-dismiss from the
 * Flutter version is replaced by tap-on-backdrop + the action buttons.
 */
export function ConfirmDeliverySheet({
  visible,
  stop,
  onDeliver,
  onSkip,
  onClose,
}: {
  visible: boolean;
  stop: DeliveryStop | null;
  onDeliver: (deliveredLitres: number, cashCollected: number | null) => void;
  onSkip: () => void;
  onClose: () => void;
}) {
  const [qty, setQty] = useState(0);
  const [cash, setCash] = useState('');

  // Reset local state whenever a new stop is opened.
  useEffect(() => {
    if (stop) {
      setQty(stop.scheduledLitres);
      setCash('');
    }
  }, [stop]);

  if (!stop) {
    return <Modal visible={false} transparent />;
  }

  const isPartial = qty < stop.scheduledLitres;

  const adjust = (delta: number) => {
    const next = Math.min(Math.max(qty + delta, 0), stop.scheduledLitres);
    setQty(Number.parseFloat(next.toFixed(1)));
  };

  const handleDeliver = () => {
    const trimmed = cash.trim();
    const parsed = trimmed === '' ? null : Number.parseFloat(trimmed);
    const cashValue = parsed != null && !Number.isNaN(parsed) ? parsed : null;
    onDeliver(qty, cashValue);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.sheetWrap}
      >
        <View style={styles.sheet}>
          <View style={styles.handle} />

          <View style={styles.codeChip}>
            <AppText style={styles.codeText}>{stop.customerCode}</AppText>
          </View>

          <AppText style={styles.name}>
            {stop.customerName} · {stop.houseNumber}
          </AppText>
          <AppText style={styles.address}>{stop.addressLine}</AppText>

          <AppText style={styles.fieldLabel}>DELIVERING</AppText>
          <View style={styles.stepperRow}>
            <StepperBtn icon="remove" onPress={() => adjust(-0.5)} />
            <View style={styles.qtyWrap}>
              <AppText style={styles.qtyValue}>
                {qty % 1 === 0 ? qty.toFixed(0) : qty.toFixed(1)}
              </AppText>
              <AppText style={styles.qtyUnit}> L</AppText>
            </View>
            <StepperBtn icon="add" onPress={() => adjust(0.5)} />
          </View>
          <AppText style={[styles.qtyHint, isPartial && { color: colors.warningDark }]}>
            {isPartial
              ? `Partial · scheduled was ${fmtLitres(stop.scheduledLitres)} L`
              : 'Scheduled quantity'}
          </AppText>

          <AppText style={styles.fieldLabel}>CASH COLLECTED (OPTIONAL)</AppText>
          <View style={styles.cashRow}>
            <AppText style={styles.cashPrefix}>₹</AppText>
            <TextInput
              value={cash}
              onChangeText={setCash}
              keyboardType="decimal-pad"
              placeholder="0"
              placeholderTextColor={colors.textMuted}
              style={styles.cashInput}
            />
          </View>

          <Pressable
            onPress={handleDeliver}
            style={({ pressed }) => [styles.deliverBtn, pressed && { opacity: 0.85 }]}
          >
            <MaterialIcons name="check" size={20} color={colors.white} />
            <AppText style={styles.deliverText}>Mark delivered</AppText>
          </Pressable>

          <Pressable
            onPress={onSkip}
            style={({ pressed }) => [styles.skipBtn, pressed && { opacity: 0.6 }]}
          >
            <MaterialIcons name="do-not-disturb-alt" size={16} color={colors.textSecondary} />
            <AppText style={styles.skipText}>Skip — customer not home</AppText>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function StepperBtn({
  icon,
  onPress,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.stepperBtn, pressed && { opacity: 0.6 }]}
    >
      <MaterialIcons name={icon} size={24} color={colors.brand} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheetWrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 32,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 16,
  },
  codeChip: {
    alignSelf: 'flex-start',
    backgroundColor: colors.brand50,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  codeText: { color: colors.brand, fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
  name: { fontSize: 18, fontWeight: '700', color: colors.textPrimary, marginTop: 12 },
  address: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  fieldLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '500',
    letterSpacing: 0.4,
    marginTop: 24,
    marginBottom: 8,
  },
  stepperRow: { flexDirection: 'row', alignItems: 'center' },
  stepperBtn: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyWrap: { flex: 1, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center' },
  qtyValue: { fontSize: 44, fontWeight: '700', color: colors.textPrimary },
  qtyUnit: { fontSize: 18, color: colors.textSecondary, fontWeight: '500', marginBottom: 6 },
  qtyHint: { textAlign: 'center', color: colors.textMuted, fontSize: 12, fontWeight: '500', marginTop: 6 },
  cashRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 16,
  },
  cashPrefix: { fontSize: 17, color: colors.textSecondary },
  cashInput: { flex: 1, fontSize: 17, paddingVertical: 14, marginLeft: 4, color: colors.textPrimary },
  deliverBtn: {
    flexDirection: 'row',
    height: 52,
    marginTop: 20,
    borderRadius: radius.lg,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deliverText: { color: colors.brandFg, fontSize: 16, fontWeight: '600', marginLeft: 8 },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
    paddingVertical: 8,
  },
  skipText: { color: colors.textSecondary, fontSize: 14, marginLeft: 6 },
});
