/**
 * Jharanai design tokens — port of the Flutter app's theme/tokens.dart,
 * which itself mirrors packages/shared/src/tokens.ts. Keep the three in
 * sync: a token change here should be reflected in the shared package and
 * the Plan B Flutter app.
 */

export const colors = {
  // Brand
  brand: '#1F4E78',
  brandFg: '#FFFFFF',
  brand50: '#F0F6FB',
  brand100: '#D7E6F2',
  brand600: '#1A4264',

  // Accent
  accent: '#1F77B4',
  accentLight: '#4FC3F7',

  // Status
  success: '#1F8B4C',
  successLight: '#E6F3EC',
  successDark: '#136A38',

  warning: '#E08400',
  warningLight: '#FFF1DC',
  warningDark: '#A85F00',

  danger: '#C8362B',
  dangerLight: '#FCE6E3',
  dangerDark: '#9A2820',

  // Surfaces
  bg: '#F4F6F8',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFB',
  border: '#E5E9EE',
  divider: '#EEF1F4',

  // Text
  textPrimary: '#0F1A24',
  textSecondary: '#5A6878',
  textMuted: '#8A95A2',

  // Misc
  black: '#000000',
  white: '#FFFFFF',
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 14,
  xl: 18,
  pill: 999,
} as const;

/** The default per-litre rate used for the milkman's local "to collect"
 *  estimate. In production this should come from the backend per customer;
 *  kept here only as a display fallback (mirrors the Flutter app). */
export const RATE_PER_LITRE_INR = 64;
