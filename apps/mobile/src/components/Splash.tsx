import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';
import { AppText } from './ui/Text';

/** Branded boot splash, shown while we load fonts and validate the cached
 *  JWT. Port of the Flutter _BootSplash. */
export function Splash() {
  return (
    <View style={styles.container}>
      <View style={styles.logo}>
        <Ionicons name="water" size={36} color={colors.white} />
      </View>
      <AppText style={styles.brand}>Jharanai</AppText>
      <ActivityIndicator color={colors.white} style={{ marginTop: 24 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  logo: {
    width: 72,
    height: 72,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: { color: colors.white, fontSize: 22, fontWeight: '700', marginTop: 16 },
});
