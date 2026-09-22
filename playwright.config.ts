import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 90_000,
  use: {
    channel: 'msedge',
    baseURL: 'http://localhost:5198/permit-study/',
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: { command: 'npx vite --port 5198 --strictPort', url: 'http://localhost:5198/permit-study/', reuseExistingServer: true },
});
