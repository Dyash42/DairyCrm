import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { deliveryApi } from '@/api/deliveryApi';
import { isApiError } from '@/api/errors';
import { AppText } from '@/components/ui/Text';
import { fmtLitres } from '@/lib/format';
import { useRouteStore } from '@/state/routeStore';
import { useSyncStore } from '@/state/syncStore';
import { toast } from '@/state/toastStore';
import { colors, radius } from '@/theme/tokens';

/**
 * End-of-day summary (port of end_of_day_screen.dart). On submit:
 *   1. Drain any pending offline scans so the backend sees them.
 *   2. POST /deliveries/end-of-day with the milkman's tally.
 *   3. Surface the variance the backend computed, then pop home.
 */
export default function EndOfDayScreen() {
  const router = useRouter();
  const summary = useRouteStore((s) => s.summary);
  const queueDepth = useSyncStore((s) => s.queueDepth);
  const failedDepth = useSyncStore((s) => s.failedDepth);
  const [submitting, setSubmitting] = useState(false);
  // The milkman enters the ACTUAL cash counted. Previously the app sent a
  // synthetic estimate (litres × flat ₹64) as "cash reported", so variance was
  // meaningless for every UPI/partial/non-64-rate customer (audit MOB-01/MIL-02).
  const [cashInput, setCashInput] = useState('');

  const submit = async () => {
    if (submitting) return;
    const reportedCash = Number(cashInput);
    if (cashInput.trim() === '' || !Number.isFinite(reportedCash) || reportedCash < 0) {
      toast.warning('Enter the total cash you actually collected (₹)');
      return;
    }
    setSubmitting(true);
    try {
      await useSyncStore.getState().drainNow();
      // Don't close the day on incomplete data: if scans are still pending or
      // parked as failed, the backend would compute totals from a partial set
      // (audit MOB-08). Block and tell the milkman to retry.
      const { queueDepth: pending, failedDepth: failed } = useSyncStore.getState();
      if (pending > 0 || failed > 0) {
        toast.danger(
          `${pending + failed} scan(s) haven't synced yet — can't submit. Check your connection and try again.`,
        );
        setSubmitting(false);
        return;
      }
      const report = await deliveryApi.submitEndOfDay({
        reportedCashTotal: reportedCash,
      });
      const variance = report.cashVariance ?? 0;
      if (Math.abs(variance) < 0.01) {
        toast.success('Day report submitted');
      } else {
        toast.warning(`Day report submitted — variance ₹${variance.toFixed(2)}`);
      }
      router.back();
    } catch (e) {
      toast.danger(`Submit failed: ${isApiError(e) ? e.message : String(e)}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <View style={styles.container}>
        <AppText style={styles.heading}>Day summary</AppText>
        <AppText style={styles.sub}>
          {summary.dateLabel} · {summary.routeLabel}
        </AppText>

        <View style={{ height: 24 }} />
        <StatRow label="Customers served" value={`${summary.servedCount}`} />
        <StatRow label="Litres delivered" value={`${fmtLitres(summary.litresDeliveredTotal)} L`} />
        <StatRow label="Skipped" value={`${summary.skippedCount}`} />
        <StatRow label="Expected (system est.)" value={`₹${summary.amountToCollect}`} />

        <View style={{ height: 16 }} />
        <AppText style={styles.cashLabel}>Cash collected (₹)</AppText>
        <TextInput
          value={cashInput}
          onChangeText={setCashInput}
          keyboardType="numeric"
          placeholder="Enter the total cash you counted"
          placeholderTextColor={colors.textMuted}
          style={styles.cashInput}
        />

        {queueDepth > 0 ? (
          <View style={styles.queueWarn}>
            <MaterialIcons name="cloud-upload" size={20} color={colors.warningDark} />
            <AppText style={styles.queueText}>
              {queueDepth} scan(s) still syncing — submitting will flush them first
            </AppText>
          </View>
        ) : null}

        {failedDepth > 0 ? (
          <View style={styles.failedWarn}>
            <MaterialIcons name="error-outline" size={20} color={colors.dangerDark} />
            <AppText style={styles.failedText}>
              {failedDepth} scan(s) failed to sync and need attention — they are NOT in this report.
            </AppText>
          </View>
        ) : null}

        <View style={{ flex: 1 }} />
        <Pressable
          disabled={submitting}
          onPress={submit}
          style={({ pressed }) => [styles.button, (pressed || submitting) && { opacity: 0.85 }]}
        >
          {submitting ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <AppText style={styles.buttonText}>Submit day report</AppText>
          )}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.statRow}>
      <AppText style={styles.statLabel}>{label}</AppText>
      <AppText style={styles.statValue}>{value}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  container: { flex: 1, padding: 20 },
  heading: { fontSize: 20, fontWeight: '700', color: colors.textPrimary },
  sub: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  statRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8 },
  statLabel: { flex: 1, fontSize: 14, color: colors.textSecondary },
  statValue: { fontSize: 17, fontWeight: '700', color: colors.textPrimary },
  cashLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  cashInput: {
    height: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: 14,
    fontSize: 18,
    fontWeight: '700',
    color: colors.textPrimary,
    backgroundColor: colors.white,
  },
  queueWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    padding: 12,
    backgroundColor: colors.warningLight,
    borderRadius: radius.lg,
  },
  queueText: { flex: 1, marginLeft: 8, color: colors.warningDark, fontSize: 13 },
  failedWarn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    padding: 12,
    backgroundColor: colors.dangerLight,
    borderRadius: radius.lg,
  },
  failedText: { flex: 1, marginLeft: 8, color: colors.dangerDark, fontSize: 13 },
  button: {
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: colors.brandFg, fontSize: 16, fontWeight: '600' },
});
