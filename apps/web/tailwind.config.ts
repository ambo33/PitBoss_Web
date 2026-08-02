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
          muted: '#b0b0c0',
          text: '#d0d0dc',
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
