/**
 * Jharanai design tokens
 * Single source of truth — mirrored by Tailwind config and Flutter theme.
 */

export const colors = {
  // Brand
  brand: {
    DEFAULT: '#1F4E78', // deep dairy blue
    fg: '#FFFFFF',
    50: '#F0F6FB',
    100: '#D7E6F2',
    200: '#A9C7DE',
    300: '#7BA8CA',
    400: '#4D89B6',
    500: '#1F4E78',
    600: '#1A4264',
    700: '#143350',
    800: '#0F253C',
    900: '#091828',
  },
  accent: {
    DEFAULT: '#1F77B4', // chart blue (matches PDF mocks)
    light: '#4FC3F7',
  },
  // Status
  success: { DEFAULT: '#1F8B4C', light: '#E6F3EC', dark: '#136A38' },
  warning: { DEFAULT: '#E08400', light: '#FFF1DC', dark: '#A85F00' },
  danger: { DEFAULT: '#C8362B', light: '#FCE6E3', dark: '#9A2820' },
  info: { DEFAULT: '#1F77B4', light: '#E2EEF7' },

  // Surfaces
  bg: '#F4F6F8',
  surface: '#FFFFFF',
  surfaceMuted: '#F8FAFB',
  border: '#E5E9EE',
  divider: '#EEF1F4',

  // Text
  text: {
    primary: '#0F1A24',
    secondary: '#5A6878',
    muted: '#8A95A2',
    inverse: '#FFFFFF',
  },
} as const;

export const radii = {
  sm: '6px',
  md: '10px',
  lg: '14px',
  xl: '18px',
  '2xl': '22px',
  full: '9999px',
} as const;

export const spacing = {
  px: '1px',
  0.5: '2px',
  1: '4px',
  2: '8px',
  3: '12px',
  4: '16px',
  5: '20px',
  6: '24px',
  8: '32px',
  10: '40px',
  12: '48px',
  16: '64px',
} as const;

export const shadows = {
  sm: '0 1px 2px 0 rgba(15, 26, 36, 0.04)',
  md: '0 4px 12px -2px rgba(15, 26, 36, 0.06), 0 2px 4px -2px rgba(15, 26, 36, 0.04)',
  lg: '0 12px 24px -8px rgba(15, 26, 36, 0.08), 0 4px 8px -2px rgba(15, 26, 36, 0.04)',
} as const;

export const typography = {
  fontFamily: {
    sans: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
    mono: '"JetBrains Mono", ui-monospace, monospace',
  },
  // Standard sizes
  sizes: {
    xs: '12px',
    sm: '13px',
    base: '14px',
    md: '15px',
    lg: '17px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '30px',
    '4xl': '36px',
  },
} as const;

/**
 * Currency formatter — always tabular numerals, ₹ prefix
 */
export const CURRENCY_LOCALE = 'en-IN';
export const CURRENCY = 'INR';

export function formatINR(amount: number): string {
  return new Intl.NumberFormat(CURRENCY_LOCALE, {
    style: 'currency',
    currency: CURRENCY,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatLitres(litres: number): string {
  return `${litres.toFixed(litres % 1 === 0 ? 0 : 1)} L`;
}
