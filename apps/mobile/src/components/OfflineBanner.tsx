import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/theme/tokens';
import { AppText } from './ui/Text';

export function OfflineBanner({ queuedCount }: { queuedCount: number }) {
  return (
    <View style={styles.banner}>
      <MaterialIcons name="cloud-off" size={18} color={colors.warningDark} />
      <AppText style={styles.text}>
        Working offline. {queuedCount} scans queued. Will sync
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.warningLight,
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  text: {
    flex: 1,
    marginLeft: 8,
    color: colors.warningDark,
    fontSize: 13,
    fontWeight: '500',
  },
});
