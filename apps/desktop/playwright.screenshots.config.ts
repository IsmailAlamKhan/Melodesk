import { defineConfig } from '@playwright/test';

/** `pnpm screenshots` regenerates the README images in docs/screenshots from the fixture-driven UI. */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.shots.ts',
  workers: 1,
  reporter: 'list',
  use: {
    baseURL: 'https://melodesk.test',
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    colorScheme: 'dark',
  },
  globalSetup: './e2e/global-setup.ts',
});
