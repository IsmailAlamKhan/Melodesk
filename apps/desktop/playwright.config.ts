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
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? [['github'], ['list']] : 'list',
  use: {
    baseURL: 'http://localhost:1420',
    viewport: { width: 1280, height: 800 },
    colorScheme: 'dark',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm exec vite',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env['CI'],
    timeout: 60_000,
  },
});
