import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  base: '/permit-study/',
  build: {
    rollupOptions: {
      input: { main: r('./index.html'), review: r('./review.html'), preview: r('./scene-preview.html') },
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
