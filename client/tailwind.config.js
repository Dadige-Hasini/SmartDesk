/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: {
          50: '#f0f3fa',
          100: '#d9e0f2',
          200: '#b4c2e6',
          300: '#8ea3d9',
          400: '#6682cc',
          500: '#4363bd',
          600: '#324c96',
          700: '#263870',
          800: '#16213e',
          900: '#1a1a2e', // Deep Navy Primary
          950: '#0f101d',
        },
        coral: {
          50: '#fff1f3',
          100: '#ffe4e7',
          200: '#fecdd4',
          300: '#fda4b1',
          400: '#fb7185',
          500: '#e94560', // Coral Accent Primary
          600: '#d32d4b',
          700: '#b11d37',
          800: '#921b32',
          900: '#7c1c2f',
        },
        amber: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};
