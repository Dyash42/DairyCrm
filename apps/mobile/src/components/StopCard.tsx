import { MaterialIcons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { fmtLitres } from '@/lib/format';
import { DeliveryStop } from '@/models/delivery';
import { colors, radius } from '@/theme/tokens';
import { StatusPill } from './ui/StatusPill';
import { AppText } from './ui/Text';

export function StopCard({
  stop,
  onScanPressed,
  onMorePressed,
  onNavigatePressed,
}: {
  stop: DeliveryStop;
  onScanPressed: () => void;
  onMorePressed: () => void;
  onNavigatePressed: () => void;
}) {
  return (
    <Pressable
      onPress={onMorePressed}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.topRow}>
        <SeqBadge seq={stop.sequence} stop={stop} />
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <AppText style={styles.title} numberOfLines={1}>
              {stop.customerName} · {stop.houseNumber}
            </AppText>
            <LitresChip stop={stop} />
          </View>
          <AppText style={styles.address} numberOfLines={1}>
            {stop.addressLine}
          </AppText>
        </View>
      </View>
      <View style={{ height: 10 }} />
      <ActionRow
        stop={stop}
        onScanPressed={onScanPressed}
        onNavigatePressed={onNavigatePressed}
      />
    </Pressable>
  );
}

function SeqBadge({ seq, stop }: { seq: number; stop: DeliveryStop }) {
  let bg: string = colors.brand50;
  let fg: string = colors.brand;
  let content: React.ReactNode = <AppText style={[styles.seqText, { color: fg }]}>{seq}</AppText>;

  if (stop.isDelivered) {
    bg = colors.successLight;
    fg = colors.successDark;
    content = <MaterialIcons name="check" size={16} color={fg} />;
  } else if (stop.isSkipped) {
    bg = colors.surfaceMuted;
    fg = colors.textMuted;
    content = <MaterialIcons name="do-not-disturb-alt" size={14} color={fg} />;
  }

  return <View style={[styles.seqBadge, { backgroundColor: bg }]}>{content}</View>;
}

function LitresChip({ stop }: { stop: DeliveryStop }) {
  const value =
    stop.isDelivered && stop.deliveredLitres != null
      ? stop.deliveredLitres
      : stop.scheduledLitres;
  const color = stop.isDelivered
    ? colors.successDark
    : stop.isSkipped
      ? colors.textMuted
      : colors.textPrimary;

  return (
    <View style={styles.litresRow}>
      <AppText style={[styles.litresValue, { color }]}>{fmtLitres(value)}</AppText>
      <AppText style={[styles.litresUnit, { color }]}> L</AppText>
    </View>
  );
}

function ActionRow({
  stop,
  onScanPressed,
  onNavigatePressed,
}: {
  stop: DeliveryStop;
  onScanPressed: () => void;
  onNavigatePressed: () => void;
}) {
  const navBtn = (
    <Pressable
      onPress={onNavigatePressed}
      style={({ pressed }) => [styles.navBtn, pressed && { opacity: 0.7 }]}
    >
      <MaterialIcons name="directions" size={16} color={colors.brand} />
      <AppText style={styles.navBtnText}>Navigate</AppText>
    </Pressable>
  );

  if (stop.isPending) {
    return (
      <View style={styles.actionRow}>
        <StatusPill label="PENDING" bg={colors.warningLight} fg={colors.warningDark} />
        <View style={{ flex: 1 }} />
        {navBtn}
        <View style={{ width: 8 }} />
        <Pressable
          onPress={onScanPressed}
          style={({ pressed }) => [styles.scanBtn, pressed && { opacity: 0.7 }]}
        >
          <MaterialIcons name="qr-code-scanner" size={16} color={colors.brand} />
          <AppText style={styles.scanBtnText}>Scan to deliver</AppText>
        </Pressable>
      </View>
    );
  }

  if (stop.isSkipped) {
    return (
      <View style={styles.actionRow}>
        <StatusPill label="SKIPPED" bg="#EFF1F4" fg={colors.textMuted} />
        <View style={{ flex: 1 }} />
        {navBtn}
      </View>
    );
  }

  return (
    <View style={styles.actionRow}>
      <StatusPill
        label="DELIVERED"
        bg={colors.successLight}
        fg={colors.successDark}
        icon="check-circle"
      />
      {stop.isPartial ? (
        <AppText style={styles.partialNote}>
          partial · was {fmtLitres(stop.scheduledLitres)} L
        </AppText>
      ) : null}
      <View style={{ flex: 1 }} />
      {navBtn}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 16,
    marginVertical: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  topRow: { flexDirection: 'row', alignItems: 'flex-start' },
  seqBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seqText: { fontWeight: '700', fontSize: 13 },
  body: { flex: 1, marginLeft: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  title: { flex: 1, fontWeight: '600', fontSize: 15, color: colors.textPrimary },
  address: { color: colors.textSecondary, fontSize: 13, marginTop: 4 },
  litresRow: { flexDirection: 'row', alignItems: 'flex-end', marginLeft: 8 },
  litresValue: { fontWeight: '700', fontSize: 17 },
  litresUnit: { fontSize: 12, fontWeight: '500' },
  actionRow: { flexDirection: 'row', alignItems: 'center' },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.brand,
    borderRadius: radius.md,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  scanBtnText: {
    color: colors.brand,
    fontWeight: '600',
    fontSize: 13,
    marginLeft: 6,
  },
  navBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  navBtnText: {
    color: colors.brand,
    fontWeight: '600',
    fontSize: 13,
    marginLeft: 6,
  },
  partialNote: {
    color: colors.textSecondary,
    fontSize: 12,
    fontStyle: 'italic',
    marginLeft: 8,
  },
});
