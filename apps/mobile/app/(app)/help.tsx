import { MaterialIcons } from '@expo/vector-icons';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/ui/Text';
import { colors } from '@/theme/tokens';

/** Field-team help (port of help_screen.dart). Static content — works offline. */
export default function HelpScreen() {
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <Step
        number="1"
        title="Open the app at the start of your shift"
        body="Your assigned route loads with every customer on it, in the right order. Each customer's QR code is shown at their door."
      />
      <Step
        number="2"
        title="Drop the milk, then scan the QR"
        body="Tap the green Scan button. Point the camera at the QR. The customer's row turns green — that's the receipt for everyone."
      />
      <Step
        number="3"
        title="Partial / extra / skipped? Use the sheet"
        body="After the scan, a sheet pops up. If they took less than usual or skipped today, change the litres or tap Skip with a reason. The customer sees what you logged — keep it accurate."
      />
      <Step
        number="4"
        title="If you're offline, keep going"
        body="Scans queue up on your phone. When the signal comes back the app syncs everything to the office. The header shows a small badge when scans are pending."
      />
      <Step
        number="5"
        title="End of day: report cash + drive home"
        body="Tap End of day from the route screen. Enter the total cash you collected today. That submission closes the route and tells the office you're done."
      />

      <View style={{ height: 8 }} />
      <Banner
        icon="info-outline"
        title="Lost or damaged QR?"
        body="Call the office. They can regenerate a fresh QR from the admin panel — the customer's account stays the same."
      />
      <Banner
        icon="shield"
        title="Never share your OTP"
        body="We only ever ask for the OTP on this app's login screen. Office staff will never call you to read out your code."
      />
    </ScrollView>
  );
}

function Step({ number, title, body }: { number: string; title: string; body: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepNum}>
        <AppText style={styles.stepNumText}>{number}</AppText>
      </View>
      <View style={styles.stepBody}>
        <AppText style={styles.stepTitle}>{title}</AppText>
        <AppText style={styles.stepText}>{body}</AppText>
      </View>
    </View>
  );
}

function Banner({
  icon,
  title,
  body,
}: {
  icon: keyof typeof MaterialIcons.glyphMap;
  title: string;
  body: string;
}) {
  return (
    <View style={styles.banner}>
      <MaterialIcons name={icon} size={20} color={colors.warningDark} />
      <View style={styles.bannerBody}>
        <AppText style={styles.bannerTitle}>{title}</AppText>
        <AppText style={styles.bannerText}>{body}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 20, paddingBottom: 24, gap: 16 },
  step: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepNum: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: colors.brand50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumText: { fontSize: 15, fontWeight: '700', color: colors.brand },
  stepBody: { flex: 1, marginLeft: 14 },
  stepTitle: { fontSize: 15, fontWeight: '600', color: colors.textPrimary },
  stepText: { fontSize: 13.5, lineHeight: 19, color: colors.textSecondary, marginTop: 4 },
  banner: {
    flexDirection: 'row',
    padding: 14,
    backgroundColor: colors.warningLight,
    borderRadius: 12,
  },
  bannerBody: { flex: 1, marginLeft: 12 },
  bannerTitle: { fontSize: 14, fontWeight: '700', color: colors.warningDark },
  bannerText: { fontSize: 13, color: colors.textPrimary, lineHeight: 18, marginTop: 4 },
});
