import {
  Text as RNText,
  StyleSheet,
  type TextProps,
  type TextStyle,
} from 'react-native';

import { colors } from '@/theme/tokens';

/**
 * App-wide Text that applies the Inter font (loaded via @expo-google-fonts).
 * Maps a requested fontWeight to the matching static Inter family so Android
 * doesn't synthetically bold the regular face. Use exactly like RN <Text>.
 */
function familyFor(weight: TextStyle['fontWeight']): string {
  switch (String(weight ?? '400')) {
    case '700':
    case 'bold':
      return 'Inter_700Bold';
    case '600':
      return 'Inter_600SemiBold';
    case '500':
      return 'Inter_500Medium';
    default:
      return 'Inter_400Regular';
  }
}

export function AppText({ style, ...rest }: TextProps) {
  const flat = (StyleSheet.flatten(style) ?? {}) as TextStyle;
  const fontFamily = familyFor(flat.fontWeight);
  // Strip fontWeight: the named static font already encodes the weight.
  const { fontWeight: _drop, ...cleaned } = flat;
  return (
    <RNText {...rest} style={[{ color: colors.textPrimary, fontFamily }, cleaned]} />
  );
}
