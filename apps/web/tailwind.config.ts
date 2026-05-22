import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        pit: {
          bg: '#18181b',
          surface: '#27272a',
          border: '#3f3f46',
          muted: '#52525b',
          text: '#a1a1aa',
          teal: '#058484',
          'teal-hover': '#067070',
          'teal-dim': '#0a6b6b',
        },
      },
      fontFamily: {
        sans: ['Sora', 'sans-serif'],
      },
    },
  },
  plugins: [],
} satisfies Config;
