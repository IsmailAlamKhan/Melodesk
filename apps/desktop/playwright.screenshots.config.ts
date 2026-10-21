import { defineConfig } from '@playwright/test';

/** `pnpm screenshots` regenerates the README images in docs/screenshots from the fixture-driven UI. */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.shots.ts',
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:1420',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  },
  webServer: {
    command: 'pnpm exec vite',
    url: 'http://localhost:1420',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
