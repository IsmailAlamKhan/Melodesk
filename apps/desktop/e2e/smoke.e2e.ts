import { expect, test } from '@playwright/test';
import { emit, installTauri, sentCommands, startPlayback } from './mock-tauri';

test.beforeEach(async ({ page }) => {
  await installTauri(page);
});

test('home shows shelves from the account feed', async ({ page }) => {
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await expect(page.getByRole('heading', { name: 'Indian Music' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Trending community playlists' })).toBeVisible();
});

test('the player bar follows the track and sends transport commands', async ({ page }) => {
  await page.goto('/');
  await startPlayback(page, { positionS: 12 });
  await expect(page.getByText('Test Song').first()).toBeVisible();
  // The byline the player reports, then the artists YouTube lists for the track once known.
  await expect(page.getByText(/Test Artist|Rick Astley/u).first()).toBeVisible();
  await page.getByRole('button', { name: 'Pause' }).first().click();
  expect((await sentCommands(page)).some((c) => c['type'] === 'toggle')).toBe(true);
});
