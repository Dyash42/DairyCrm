import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { fmtLitres } from '@/lib/format';
import { RouteSummary } from '@/models/delivery';
import { colors, radius } from '@/theme/tokens';
import { AppText } from './ui/Text';

export function RouteHeader({ summary }: { summary: RouteSummary }) {
  const initial = summary.executiveName
    ? summary.executiveName[0].toUpperCase()
    : '?';

  return (
    <View style={styles.container}>
      <View style={styles.greetRow}>
        <View style={styles.avatar}>
          <AppText style={styles.avatarText}>{initial}</AppText>
        </View>
        <View style={styles.greetText}>
          <AppText style={styles.greetLabel}>Good morning,</AppText>
          <AppText style={styles.execName}>{summary.executiveName}</AppText>
        </View>
      </View>
      <AppText style={styles.subLine}>
        {summary.dateLabel} · {summary.routeLabel}
      </AppText>

      <View style={styles.tiles}>
        <StatTile
          icon="groups"
          value={`${summary.servedCount}/${summary.totalCustomers}`}
          label="CUSTOMERS"
        />
        <View style={{ width: 10 }} />
        <StatTile
          icon="water-drop"
          value={fmtLitres(summary.litresLeft)}
          unit="L"
          label="LITRES LEFT"
        />
        <View style={{ width: 10 }} />
        <StatTile value={`${summary.completionPct}`} unit="%" label="COMPLETION" />
      </View>
    </View>
  );
}

function StatTile({
  icon,
  value,
  unit,
  label,
}: {
  icon?: keyof typeof MaterialIcons.glyphMap;
  value: string;
  unit?: string;
  label: string;
}) {
  return (
    <View style={styles.tile}>
      {icon ? (
        <MaterialIcons
          name={icon}
          size={16}
          color="rgba(255,255,255,0.7)"
          style={{ marginBottom: 6 }}
        />
      ) : null}
      <View style={styles.tileValueRow}>
        <AppText style={styles.tileValue}>{value}</AppText>
        {unit ? <AppText style={styles.tileUnit}>{unit}</AppText> : null}
      </View>
      <AppText style={styles.tileLabel}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: colors.brand,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  greetRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontWeight: '700', fontSize: 18 },
  greetText: { marginLeft: 12, flex: 1 },
  greetLabel: { color: 'rgba(255,255,255,0.7)', fontSize: 13 },
  execName: { color: colors.white, fontWeight: '700', fontSize: 20, marginTop: 2 },
  subLine: { color: 'rgba(255,255,255,0.7)', fontSize: 12, marginTop: 6, marginLeft: 56 },
  tiles: { flexDirection: 'row', marginTop: 20 },
  tile: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.lg,
  },
  tileValueRow: { flexDirection: 'row', alignItems: 'flex-end' },
  tileValue: { color: colors.white, fontSize: 20, fontWeight: '700' },
  tileUnit: { color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: '500', marginLeft: 2 },
  tileLabel: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 10,
    letterSpacing: 0.6,
    fontWeight: '600',
    marginTop: 2,
  },
});
