/**
 * Zahiri design system.
 *
 * Dark-first. The palette is built around one idea: a verdict has a colour, and
 * that colour means the same thing everywhere in the app. Nothing else in the UI
 * is allowed to use the verdict hues.
 */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{js,jsx,ts,tsx}', './components/**/*.{js,jsx,ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
        // Ground and surfaces
        ink: {
          DEFAULT: '#0B0F14',
          deep: '#070A0E',
          raised: '#141A21',
          high: '#1C242E',
          edge: '#263039',
        },
        // Type
        chalk: {
          DEFAULT: '#E8EEF4',
          soft: '#8FA3B5',
          faint: '#5C6F80',
        },
        // Brand
        zahiri: {
          DEFAULT: '#00D68F',
          dim: '#00A46E',
          glow: '#4DFFC3',
        },
        // Verdict language — reserved, never decorative
        verdict: {
          verified: '#00D68F',
          unverified: '#FFB020',
          misleading: '#FF9A3C',
          false: '#FF4757',
          pending: '#8FA3B5',
        },
        info: '#6C8BFF',
      },
      fontFamily: {
        display: ['InterTight_700Bold'],
        'display-medium': ['InterTight_600SemiBold'],
        sans: ['Inter_400Regular'],
        medium: ['Inter_500Medium'],
        semibold: ['Inter_600SemiBold'],
        bold: ['Inter_700Bold'],
      },
      fontSize: {
        micro: ['11px', { lineHeight: '14px', letterSpacing: '0.4px' }],
        caption: ['12px', { lineHeight: '16px' }],
        body: ['15px', { lineHeight: '23px' }],
        lead: ['17px', { lineHeight: '26px' }],
        title: ['20px', { lineHeight: '26px' }],
        h2: ['26px', { lineHeight: '32px' }],
        h1: ['34px', { lineHeight: '40px' }],
      },
      borderRadius: {
        card: '20px',
        pill: '999px',
      },
      spacing: {
        gutter: '20px',
      },
    },
  },
  plugins: [],
};
