import { expect, test } from '@playwright/test';
import { emit, installTauri } from './mock-tauri';

// A build compiled without the optional native modules (`--no-default-features`).
test.beforeEach(async ({ page }) => {
  await installTauri(page, { nativeModules: [] });
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await page.getByRole('link', { name: 'Settings' }).click();
});

test('features that need a missing module are off and say why', async ({ page }) => {
  await expect(page.getByRole('heading', { name: 'Global shortcuts', level: 2 })).toHaveCount(0);
  const toggle = page.getByRole('switch', { name: /^Global shortcuts [A-Z]/u });
  await expect(toggle).toBeDisabled();
  await expect(toggle).not.toBeChecked();
  await expect(page.getByText('Not available in this build')).toBeVisible();
});

test('plugins that need a missing module are not offered, the others still are', async ({
  page,
}) => {
  await expect(page.getByRole('switch', { name: 'Enable Last.fm' })).toBeVisible();
  await expect(page.getByRole('switch', { name: 'Enable Discord Rich Presence' })).toHaveCount(0);
});
