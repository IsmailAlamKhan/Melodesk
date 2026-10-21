import { defineConfig } from '@playwright/test';

/**
 * End-to-end tests drive the real React UI in headless Chromium against a mocked Tauri backend
 * (see e2e/mock-tauri.ts). They cover our UI and its protocol handling; the injected bridge and
 * the native shell are covered by unit/Rust tests and by running the app.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  // Each worker is a headless Chromium; on a laptop two is plenty and keeps the fans down.
  ...(process.env['CI'] ? {} : { workers: 2 }),
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'https://melodesk.test',
    viewport: { width: 1280, height: 800 },
    colorScheme: 'dark',
    trace: 'retain-on-failure',
  },
  // The tests run against the built app, which `global-setup.ts` builds once and `serve-built.ts`
  // serves to each page from disk. No server, so nothing depends on loopback connections working.
  globalSetup: './e2e/global-setup.ts',
});
