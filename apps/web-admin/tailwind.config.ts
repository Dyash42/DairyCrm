import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/shared/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#1F4E78',
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
          DEFAULT: '#1F77B4',
          light: '#4FC3F7',
        },
        success: {
          DEFAULT: '#1F8B4C',
          light: '#E6F3EC',
          dark: '#136A38',
        },
        warning: {
          DEFAULT: '#E08400',
          light: '#FFF1DC',
          dark: '#A85F00',
        },
        danger: {
          DEFAULT: '#C8362B',
          light: '#FCE6E3',
          dark: '#9A2820',
        },
        info: {
          DEFAULT: '#1F77B4',
          light: '#E2EEF7',
        },
        surface: '#FFFFFF',
        'surface-muted': '#F8FAFB',
        bg: '#F4F6F8',
        border: '#E5E9EE',
        divider: '#EEF1F4',
        text: {
          primary: '#0F1A24',
          secondary: '#5A6878',
          muted: '#8A95A2',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          'system-ui',
          '-apple-system',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
      fontSize: {
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['13px', { lineHeight: '18px' }],
        base: ['14px', { lineHeight: '20px' }],
        md: ['15px', { lineHeight: '22px' }],
        lg: ['17px', { lineHeight: '24px' }],
        xl: ['20px', { lineHeight: '28px' }],
        '2xl': ['24px', { lineHeight: '32px' }],
        '3xl': ['30px', { lineHeight: '38px' }],
        '4xl': ['36px', { lineHeight: '44px' }],
      },
      borderRadius: {
        sm: '6px',
        md: '10px',
        lg: '14px',
        xl: '18px',
        '2xl': '22px',
      },
      boxShadow: {
        card: '0 1px 2px 0 rgba(15, 26, 36, 0.04), 0 1px 3px 0 rgba(15, 26, 36, 0.03)',
        cardHover:
          '0 4px 12px -2px rgba(15, 26, 36, 0.06), 0 2px 4px -2px rgba(15, 26, 36, 0.04)',
      },
      fontVariantNumeric: {
        tabular: 'tabular-nums',
      },
    },
  },
  plugins: [],
};

export default config;
