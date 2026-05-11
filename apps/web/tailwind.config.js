const path = require('path');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    path.join(__dirname, 'index.html'),
    path.join(__dirname, 'src/**/*.{ts,tsx}'),
  ],
  theme: {
    extend: {
      colors: {
        pit: {
          bg: '#111113',
          surface: '#1c1c21',
          card: '#212127',
          border: '#2e2e38',
          muted: '#5a5a6e',
          text: '#9898aa',
          teal: '#0ea5a5',
          'teal-hover': '#0c9292',
          'teal-dim': '#0a7a7a',
          gold: '#f0a500',
          'gold-dim': '#c47e00',
        },
      },
      fontFamily: {
        sans: ['"Nunito Sans"', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
