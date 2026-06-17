import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { fmtLitres } from '@/lib/format';
import { RouteSummary } from '@/models/delivery';
import { colors, radius } from '@/theme/tokens';
import { AppText } from './ui/Text';

export function RouteCompleteCard({
  summary,
  onSubmitDayReport,
}: {
  summary: RouteSummary;
  onSubmitDayReport: () => void;
}) {
  const hasSkipped = summary.skippedCount > 0;
  const firstName = summary.executiveName.split(' ')[0] ?? '';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <MaterialIcons name="task-alt" size={28} color={colors.successDark} />
        <AppText style={styles.title}>Route complete!</AppText>
      </View>
      <AppText style={styles.subtitle}>
        Great work, {firstName}. All stops done.
      </AppText>

      <View style={styles.stats}>
        <SuccessStat value={`${summary.servedCount}`} label="SERVED" />
        <SuccessStat
          value={fmtLitres(summary.litresDeliveredTotal)}
          unit="L"
          label="DELIVERED"
        />
        <SuccessStat value={`₹${summary.amountToCollect}`} label="TO COLLECT" />
      </View>

      {hasSkipped ? (
        <View style={styles.skipNote}>
          <MaterialIcons name="info-outline" size={16} color={colors.textSecondary} />
          <AppText style={styles.skipText}>
            {summary.skippedCount} stop{summary.skippedCount === 1 ? '' : 's'} skipped — will
            auto-retry tomorrow.
          </AppText>
        </View>
      ) : null}

      <Pressable
        onPress={onSubmitDayReport}
        style={({ pressed }) => [styles.button, pressed && { opacity: 0.85 }]}
      >
        <AppText style={styles.buttonText}>Submit day report</AppText>
      </Pressable>
    </View>
  );
}

function SuccessStat({
  value,
  unit,
  label,
}: {
  value: string;
  unit?: string;
  label: string;
}) {
  return (
    <View style={styles.stat}>
      <View style={styles.statValueRow}>
        <AppText style={styles.statValue}>{value}</AppText>
        {unit ? <AppText style={styles.statUnit}>{unit}</AppText> : null}
      </View>
      <AppText style={styles.statLabel}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
    padding: 20,
    paddingBottom: 18,
    backgroundColor: colors.successLight,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(31,139,76,0.3)',
  },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  title: { color: colors.successDark, fontSize: 20, fontWeight: '700', marginLeft: 10 },
  subtitle: { color: colors.textSecondary, fontSize: 14, marginTop: 4 },
  stats: { flexDirection: 'row', marginTop: 16 },
  stat: { flex: 1, alignItems: 'center' },
  statValueRow: { flexDirection: 'row', alignItems: 'flex-end' },
  statValue: { color: colors.textPrimary, fontSize: 26, fontWeight: '700' },
  statUnit: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
  statLabel: {
    color: colors.textMuted,
    fontSize: 10,
    letterSpacing: 0.5,
    fontWeight: '600',
    marginTop: 2,
  },
  skipNote: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 8,
  },
  skipText: { flex: 1, marginLeft: 8, color: colors.textSecondary, fontSize: 12 },
  button: {
    marginTop: 14,
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: { color: colors.brandFg, fontSize: 16, fontWeight: '600' },
});
