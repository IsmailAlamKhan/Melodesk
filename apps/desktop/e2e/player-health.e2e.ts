import { expect, test } from '@playwright/test';
import { emit, installTauri, sentCommands } from './mock-tauri';

test('a player that never starts says so and can be reloaded', async ({ page }) => {
  await installTauri(page);
  await page.clock.install();
  await page.goto('/');
  // Never attached: after a while the app stops waiting quietly.
  await expect(page.getByRole('alert')).toHaveCount(0);
  await page.clock.fastForward(26_000);
  const banner = page.getByRole('alert');
  await expect(banner).toContainText('taking a while to start');
  await banner.getByRole('button', { name: 'Reload player' }).click();
  expect((await sentCommands(page)).some((c) => c['type'] === 'player_reload')).toBe(true);
  // Once it attaches the banner goes away on its own.
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await expect(banner).toHaveCount(0);
});

test('when YouTube changes under us the banner says so, with a way to reload', async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await emit(page, { type: 'health', status: 'broken', reason: 'player-element-missing' });
  const banner = page.getByRole('alert');
  await expect(banner).toContainText('can’t control YouTube Music');
  await expect(banner).toContainText('player-element-missing');
  await banner.getByRole('button', { name: 'Reload player' }).click();
  expect((await sentCommands(page)).some((c) => c['type'] === 'player_reload')).toBe(true);
});
