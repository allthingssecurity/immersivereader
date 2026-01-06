import type { Config } from 'tailwindcss';

export default {
  content: [
    './index.html',
    './src/**/*.{ts,tsx}'
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#f1f8ff',
          100: '#e2f0ff',
          200: '#baddff',
          300: '#8fc8ff',
          400: '#5cb0ff',
          500: '#2a98ff',
          600: '#0f7ae5',
          700: '#0b5fb3',
          800: '#084580',
          900: '#052b4d'
        }
      }
    }
  },
  plugins: []
} satisfies Config;

