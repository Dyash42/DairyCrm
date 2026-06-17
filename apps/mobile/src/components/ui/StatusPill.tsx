import { MaterialIcons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { radius } from '@/theme/tokens';
import { AppText } from './Text';

export function StatusPill({
  label,
  bg,
  fg,
  icon,
}: {
  label: string;
  bg: string;
  fg: string;
  icon?: keyof typeof MaterialIcons.glyphMap;
}) {
  return (
    <View style={[styles.pill, { backgroundColor: bg }]}>
      {icon ? (
        <MaterialIcons name={icon} size={13} color={fg} style={styles.icon} />
      ) : null}
      <AppText style={[styles.label, { color: fg }]}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  icon: { marginRight: 4 },
  label: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5 },
});
