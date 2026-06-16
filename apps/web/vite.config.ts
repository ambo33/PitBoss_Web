import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

const seoPaths = new Set([
  '/poker-timer',
  '/poker-tournament-clock',
  '/poker-tournament-director',
  '/home-poker-tournament',
  '/poker-blinds-schedule',
  '/poker-chip-calculator',
  '/pricing',
  '/terms',
]);

function seoStaticPagesPlugin() {
  return {
    name: 'pokerplanner-seo-static-pages',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url?.split('?')[0].replace(/\/$/, '') ?? '';
        if (seoPaths.has(url)) {
          req.url = `${url}/index.html`;
        }
        next();
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        const url = req.url?.split('?')[0].replace(/\/$/, '') ?? '';
        if (seoPaths.has(url)) {
          req.url = `${url}/index.html`;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [seoStaticPagesPlugin(), react()],
  envPrefix: ['VITE_', 'NEXT_PUBLIC_'],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    proxy: {
      '/api': { target: 'http://localhost:3001', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3001', ws: true },
    },
  },
});
