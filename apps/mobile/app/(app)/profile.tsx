import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { API_BASE } from '@/api/config';
import { AppText } from '@/components/ui/Text';
import { initials } from '@/lib/format';
import { useAuthStore } from '@/state/authStore';
import { colors } from '@/theme/tokens';

/** Profile / account screen (port of profile_screen.dart). */
export default function ProfileScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const confirmSignOut = () => {
    Alert.alert('Sign out?', "You'll need to log in again with the OTP next time.", [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: () => void useAuthStore.getState().signOut(),
      },
    ]);
  };

  const showAbout = () => {
    Alert.alert(
      'Jharanai · Delivery  (v1.0.0)',
      "This app is the milkman's daily companion. Scan each customer's QR when you drop their milk; the system records everything, sends them a WhatsApp confirmation, and tracks payments — even if you go offline for a stretch.\n\n© 2026 Jharanai Dairy.",
    );
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={{ paddingBottom: 24 }}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <AppText style={styles.avatarText}>{initials(user?.name ?? '?')}</AppText>
        </View>
        <View style={styles.headerText}>
          <AppText style={styles.name}>{user?.name ?? 'Signed out'}</AppText>
          <AppText style={styles.role}>{user?.role ?? ''}</AppText>
        </View>
      </View>

      <Section title="Account">
        <InfoRow label="User ID" value={user?.id ?? '—'} />
        <InfoRow label="Role" value={user?.role ?? '—'} />
      </Section>

      <Section title="Connection">
        <InfoRow label="Server" value={API_BASE} />
      </Section>

      <Section title="Help & support">
        <LinkRow icon="help-outline" label="How to use the app" onPress={() => router.push('/(app)/help')} />
        <LinkRow icon="info-outline" label="About Jharanai" onPress={showAbout} />
      </Section>

      <View style={styles.signOutWrap}>
        <Pressable
          onPress={confirmSignOut}
          style={({ pressed }) => [styles.signOutBtn, pressed && { opacity: 0.7 }]}
        >
          <MaterialIcons name="logout" size={18} color={colors.dangerDark} />
          <AppText style={styles.signOutText}>Sign out</AppText>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <AppText style={styles.sectionTitle}>{title.toUpperCase()}</AppText>
      {children}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <AppText style={styles.infoLabel}>{label}</AppText>
      <AppText style={styles.infoValue} numberOfLines={1}>
        {value}
      </AppText>
    </View>
  );
}

function LinkRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.linkRow, pressed && { backgroundColor: colors.surfaceMuted }]}
    >
      <MaterialIcons name={icon} size={20} color={colors.textSecondary} />
      <AppText style={styles.linkLabel}>{label}</AppText>
      <MaterialIcons name="chevron-right" size={22} color={colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: colors.white, fontWeight: '600', fontSize: 18 },
  headerText: { marginLeft: 16, flex: 1 },
  name: { fontSize: 18, fontWeight: '600', color: colors.textPrimary },
  role: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  section: { backgroundColor: colors.surface, paddingVertical: 8, marginTop: 12 },
  sectionTitle: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.5,
    color: colors.textMuted,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 4,
  },
  infoRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 10 },
  infoLabel: { flex: 1, fontSize: 14, color: colors.textSecondary },
  infoValue: { fontSize: 14, color: colors.textPrimary, fontWeight: '500', maxWidth: '60%' },
  linkRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 12 },
  linkLabel: { flex: 1, fontSize: 14, color: colors.textPrimary, marginLeft: 12 },
  signOutWrap: { paddingHorizontal: 20, marginTop: 24 },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingVertical: 14,
  },
  signOutText: { color: colors.dangerDark, fontSize: 15, fontWeight: '500', marginLeft: 8 },
});
