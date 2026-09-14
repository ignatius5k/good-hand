import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

const base = process.env.GOOD_HAND_BASE || '/';

export default defineConfig({
  base,
  plugins: [react(), VitePWA({
    registerType: 'prompt',
    includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
    manifest: {
      name: 'Good Hand · Home game companion',
      short_name: 'Good Hand',
      description: 'Buy-ins, blinds and settling up for your home poker games.',
      id: base,
      start_url: base,
      scope: base,
      display: 'standalone',
      background_color: '#ffffff',
      theme_color: '#ffffff',
      icons: [
        { src: `${base}icon-192.png`, sizes: '192x192', type: 'image/png' },
        { src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png' },
        { src: `${base}icon-maskable.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ],
    },
    workbox: {
      globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
      navigateFallback: 'index.html',
      cleanupOutdatedCaches: true,
    },
  })],
  server: { port: 5180, strictPort: true },
  preview: { port: 5180, strictPort: true },
});
