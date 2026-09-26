import { defineConfig } from 'vitest/config';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  base: '/permit-study/',
  build: {
    rollupOptions: {
      input: { main: r('./index.html'), review: r('./review.html'), preview: r('./scene-preview.html') },
    },
  },
  plugins: [
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Permit Practice',
        short_name: 'Permit',
        description: 'Learn the NYS learner permit rules with pictures and a friendly voice.',
        start_url: '/permit-study/',
        scope: '/permit-study/',
        display: 'standalone',
        background_color: '#fdfaf3',
        theme_color: '#1e88e5',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
        ],
      },
      workbox: {
        skipWaiting: false,
        clientsClaim: false,
        globPatterns: ['**/*.{js,css,html,svg,png,mp3,json}'],
        globIgnores: ['**/scene-preview.html', '**/audio/reader/**'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // The parent fact-check page opens manual/mv21.pdf#page=N as a navigation
        // in a new tab. Without this, the SW's navigateFallback would answer that
        // navigation with index.html instead of letting the PDF request through.
        navigateFallbackDenylist: [/\/manual\//],
        // Manual reader clips are not precached (hours of audio). Each clip and its word timings are
        // cached the first time they are fetched. The reader fetch()es the current and next clip without
        // a Range header so a full 200 response gets cached; rangeRequests then serves <audio>'s ranged
        // requests from it.
        runtimeCaching: [
          {
            urlPattern: /\/audio\/reader\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'reader-audio-v1',
              expiration: { maxEntries: 2000 },
              cacheableResponse: { statuses: [0, 200] },
              rangeRequests: true,
            },
          },
        ],
      },
    }),
  ],
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
