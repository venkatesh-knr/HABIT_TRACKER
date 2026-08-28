import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/HABIT_TRACKER/',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Ritual',
        short_name: 'Ritual',
        description: 'A simple daily habit tracker',
        start_url: '.',
        display: 'standalone',
        background_color: '#F5F6F2',
        theme_color: '#3F6C51',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});
