import { defineConfig } from '@playwright/test';

const URL = 'http://localhost:5198/permit-study/';

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
  webServer: { command: 'npx vite --port 5198 --strictPort', url: URL, timeout: 120_000, reuseExistingServer: true },
});
