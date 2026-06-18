import { MaterialIcons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deliveryApi } from '@/api/deliveryApi';
import { getLocationProvider } from '@/services/location';
import { getNavigationProvider } from '@/services/navigation';
import { ConfirmDeliverySheet } from '@/components/ConfirmDeliverySheet';
import { OfflineBanner } from '@/components/OfflineBanner';
import { RouteCompleteCard } from '@/components/RouteCompleteCard';
import { RouteHeader } from '@/components/RouteHeader';
import { StopCard } from '@/components/StopCard';
import { AppText } from '@/components/ui/Text';
import { fmtLitres } from '@/lib/format';
import { normalizeScannedCode } from '@/lib/qr';
import { DeliveryStop } from '@/models/delivery';
import { useAuthStore } from '@/state/authStore';
import { DemoMode } from '@/state/demo';
import { useNetworkStore } from '@/state/networkStore';
import { useRouteStore } from '@/state/routeStore';
import { useScanStore } from '@/state/scanStore';
import { useSyncStore } from '@/state/syncStore';
import { toast } from '@/state/toastStore';
import { colors, radius } from '@/theme/tokens';

export default function TodaysRouteScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const summary = useRouteStore((s) => s.summary);
  const refresh = useRouteStore((s) => s.refresh);
  const source = useRouteStore((s) => s.source);
  const online = useNetworkStore((s) => s.online);
  const queueDepth = useSyncStore((s) => s.queueDepth);
  const lastScan = useScanStore((s) => s.lastScan);

  const [query, setQuery] = useState('');
  const [confirmStop, setConfirmStop] = useState<DeliveryStop | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Resolve a scan coming back from the scanner route.
  useEffect(() => {
    if (!lastScan) return;
    const code = normalizeScannedCode(lastScan.code);
    useScanStore.getState().clear();

    const stops = useRouteStore.getState().summary.stops;
    const match = stops.find((s) => normalizeScannedCode(s.customerCode) === code);
    if (match) {
      setConfirmStop(match);
      return;
    }
    // Not on the route — confirm the QR is at least valid, then explain.
    (async () => {
      try {
        await deliveryApi.lookupByCode(code);
        toast.warning(`${code} is not on today's route`);
      } catch {
        toast.danger(`Unknown QR: ${code}`);
      }
    })();
  }, [lastScan]);

  // MIL-04/MOB-10: load/refresh the route when the screen gains focus — on
  // mount, app resume, and when returning from scan/EOD. The route previously
  // only loaded via manual pull-to-refresh (it never auto-loaded). Guarded so
  // we never clobber optimistic OFFLINE marks: refresh only when online AND
  // either nothing is queued (the server is authoritative) or the list is
  // still empty (nothing local to lose).
  useFocusEffect(
    useCallback(() => {
      const isOnline = useNetworkStore.getState().online;
      const queued = useSyncStore.getState().queueDepth;
      const loaded = useRouteStore.getState().summary.stops.length;
      if (isOnline && (queued === 0 || loaded === 0)) {
        void useRouteStore.getState().refresh();
      }
    }, []),
  );

  const visibleStops = useMemo(() => {
    if (!query) return summary.stops;
    const q = query.toLowerCase();
    return summary.stops.filter(
      (s) =>
        s.customerName.toLowerCase().includes(q) ||
        s.houseNumber.toLowerCase().includes(q) ||
        s.addressLine.toLowerCase().includes(q),
    );
  }, [summary.stops, query]);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleDeliver = (
    stop: DeliveryStop,
    qty: number,
    cash: number | null,
  ) => {
    useRouteStore.getState().markDelivered(stop.id, qty);
    void useSyncStore.getState().recordScan({
      deliveryId: stop.id,
      customerCode: stop.customerCode,
      deliveredLitres: qty,
      cashCollected: cash,
      kind: qty < stop.scheduledLitres ? 'PARTIAL' : 'DELIVERED',
    });
    // First-delivery door-pin capture: if this customer has no location yet,
    // grab the device GPS at the door and save it (best-effort, non-blocking).
    if ((stop.lat == null || stop.lng == null) && stop.customerId) {
      void getLocationProvider()
        .getCurrentPosition()
        .then((c) =>
          c ? deliveryApi.saveCustomerLocation(stop.customerId, c.lat, c.lng) : undefined,
        )
        .catch(() => undefined);
    }
    toast.success(`Delivered ${fmtLitres(qty)} L to ${stop.customerName}`);
  };

  const handleSkip = (stop: DeliveryStop) => {
    useRouteStore.getState().markSkipped(stop.id);
    void useSyncStore.getState().recordScan({
      deliveryId: stop.id,
      customerCode: stop.customerCode,
      deliveredLitres: 0,
      note: 'Skipped',
      kind: 'SKIPPED',
    });
    toast.info(`Skipped ${stop.customerName}`);
  };

  return (
    <View style={styles.root}>
      <View
        style={{
          height: insets.top,
          backgroundColor: !online ? colors.warningLight : colors.brand,
        }}
      />
      {!online ? <OfflineBanner queuedCount={queueDepth} /> : null}

      <View>
        <RouteHeader summary={summary} />
        <Pressable
          onPress={() => setMenuOpen(true)}
          style={[styles.menuBtn, { top: 12 }]}
          hitSlop={8}
        >
          <MaterialIcons name="menu" size={24} color={colors.white} />
        </Pressable>
        {source === 'demo' ? (
          <View style={styles.demoPill}>
            <AppText style={styles.demoPillText}>DEMO DATA</AppText>
          </View>
        ) : null}
      </View>

      {/* Search stays OUTSIDE the FlatList so the input never loses focus when
          the list re-renders on each keystroke (a known RN ListHeader pitfall). */}
      <View style={styles.searchWrap}>
        <MaterialIcons name="search" size={18} color={colors.textMuted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search customer, house, area"
          placeholderTextColor={colors.textMuted}
          style={styles.searchInput}
        />
      </View>

      <View style={styles.sectionRow}>
        <AppText style={styles.sectionTitle}>DELIVERY SEQUENCE</AppText>
        {!summary.isComplete ? (
          <AppText style={styles.pending}>{summary.pendingCount} pending</AppText>
        ) : null}
      </View>

      {/* PER-06: virtualize the stop list — the previous ScrollView + .map()
          mounted every StopCard at once (a 100+ stop route rendered all rows). */}
      <FlatList
        data={visibleStops}
        keyExtractor={(stop) => stop.id}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        ListHeaderComponent={
          summary.isComplete && summary.totalCustomers > 0 ? (
            <RouteCompleteCard
              summary={summary}
              onSubmitDayReport={() => router.push('/end-of-day')}
            />
          ) : null
        }
        renderItem={({ item: stop }) => (
          <StopCard
            stop={stop}
            onScanPressed={() => router.push('/scan')}
            onMorePressed={() => {
              if (stop.isPending) setConfirmStop(stop);
            }}
            onNavigatePressed={() =>
              void getNavigationProvider().navigateTo({
                lat: stop.lat,
                lng: stop.lng,
                label: `${stop.customerName}, ${stop.addressLine}`,
              })
            }
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <AppText style={styles.emptyText}>
              {summary.totalCustomers === 0
                ? 'No route loaded yet. Pull to refresh.'
                : 'No matches'}
            </AppText>
          </View>
        }
      />

      {!summary.isComplete ? (
        <Pressable
          onPress={() => router.push('/scan')}
          style={({ pressed }) => [
            styles.fab,
            { bottom: insets.bottom + 20 },
            pressed && { opacity: 0.9 },
          ]}
        >
          <MaterialIcons name="qr-code-scanner" size={22} color={colors.white} />
          <AppText style={styles.fabText}>Scan QR</AppText>
        </Pressable>
      ) : null}

      <ConfirmDeliverySheet
        visible={confirmStop != null}
        stop={confirmStop}
        onClose={() => setConfirmStop(null)}
        onDeliver={(qty, cash) => {
          if (confirmStop) handleDeliver(confirmStop, qty, cash);
          setConfirmStop(null);
        }}
        onSkip={() => {
          if (confirmStop) handleSkip(confirmStop);
          setConfirmStop(null);
        }}
      />

      <HeaderMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        onAccount={() => {
          setMenuOpen(false);
          router.push('/profile');
        }}
        onHelp={() => {
          setMenuOpen(false);
          router.push('/help');
        }}
        onSignOut={() => {
          setMenuOpen(false);
          Alert.alert('Sign out?', "You'll need to log in again with the OTP next time.", [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Sign out',
              style: 'destructive',
              onPress: () => void useAuthStore.getState().signOut(),
            },
          ]);
        }}
      />
    </View>
  );
}

function HeaderMenu({
  visible,
  onClose,
  onAccount,
  onHelp,
  onSignOut,
}: {
  visible: boolean;
  onClose: () => void;
  onAccount: () => void;
  onHelp: () => void;
  onSignOut: () => void;
}) {
  const setDemoMode = useRouteStore((s) => s.setDemoMode);
  const demoMode = useRouteStore((s) => s.demoMode);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.menuBackdrop} onPress={onClose} />
      <View style={styles.menuCard}>
        <MenuItem icon="person-outline" label="Account" onPress={onAccount} />
        <MenuItem icon="help-outline" label="How to use the app" onPress={onHelp} />

        {__DEV__ ? (
          <View style={styles.devSection}>
            <AppText style={styles.devLabel}>DEV · DEMO DATA</AppText>
            {(
              [
                ['off', 'Live data'],
                ['morning', 'Demo: morning'],
                ['midRoute', 'Demo: mid-route'],
                ['complete', 'Demo: complete'],
              ] as [DemoMode, string][]
            ).map(([mode, label]) => (
              <MenuItem
                key={mode}
                icon={demoMode === mode ? 'radio-button-checked' : 'radio-button-unchecked'}
                label={label}
                onPress={() => {
                  setDemoMode(mode);
                  onClose();
                }}
              />
            ))}
          </View>
        ) : null}

        <View style={styles.menuDivider} />
        <MenuItem icon="logout" label="Sign out" danger onPress={onSignOut} />
      </View>
    </Modal>
  );
}

function MenuItem({
  icon,
  label,
  onPress,
  danger,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const color = danger ? colors.dangerDark : colors.textPrimary;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.menuItem, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      <MaterialIcons name={icon} size={20} color={danger ? colors.dangerDark : colors.textSecondary} />
      <AppText style={[styles.menuItemText, { color }]}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  menuBtn: { position: 'absolute', left: 8 },
  demoPill: {
    position: 'absolute',
    top: 14,
    right: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  demoPillText: { color: colors.white, fontSize: 10, fontWeight: '700', letterSpacing: 0.5 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
  },
  searchInput: { flex: 1, paddingVertical: 10, marginLeft: 8, fontSize: 14, color: colors.textPrimary },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 6,
  },
  sectionTitle: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  pending: { color: colors.textSecondary, fontSize: 12, fontWeight: '500' },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { color: colors.textMuted, textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.brand,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: radius.pill,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: colors.white, fontWeight: '600', fontSize: 15, marginLeft: 8 },
  menuBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' },
  menuCard: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    width: 280,
    backgroundColor: colors.surface,
    paddingTop: 60,
    paddingHorizontal: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderRadius: 10,
  },
  menuItemText: { fontSize: 15, marginLeft: 12 },
  devSection: { marginTop: 8 },
  devLabel: {
    color: colors.textMuted,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    paddingHorizontal: 12,
    paddingTop: 8,
  },
  menuDivider: { height: 1, backgroundColor: colors.divider, marginVertical: 8, marginHorizontal: 12 },
});
