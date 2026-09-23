import { defineConfig } from '@playwright/test';

const URL = 'http://localhost:5391/permit-study/';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  retries: 0, // a failure must show up, not be retried away
  use: {
    channel: 'msedge',
    baseURL: URL,
    trace: 'retain-on-failure',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  // Tests start only once the app URL answers; allow a cold Vite start.
  // Never reuse a running server: a stale Vite can miss public/ files and mask failures.
  webServer: { command: 'npx vite --port 5391 --strictPort', url: URL, timeout: 120_000, reuseExistingServer: false },
});
