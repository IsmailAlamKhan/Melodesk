import { expect, test } from '@playwright/test';
import { emit, installTauri } from './mock-tauri';

test.beforeEach(async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Settings' })
    .click();
});

test('a plugin sees the settings you type as soon as you type them', async ({ page }) => {
  await page.getByRole('switch', { name: /Last\.fm/u }).check();
  const hint = 'Enter your API key and secret first';
  await expect(page.getByText(hint)).toBeVisible();

  await page.getByLabel('API key').fill('test-key');
  await page.getByLabel('Shared secret').fill('test-secret');
  // Nothing is missing any more, so the hint goes away without restarting the app.
  await expect(page.getByText(hint)).toBeHidden();
  await expect(page.getByText('Not connected')).toBeVisible();

  await page.getByRole('button', { name: 'Connect to Last.fm' }).click();
  await expect(page.getByText(hint)).toBeHidden();
});

test('clearing a field brings the hint back', async ({ page }) => {
  await page.getByRole('switch', { name: /Last\.fm/u }).check();
  await page.getByLabel('API key').fill('k');
  await page.getByLabel('Shared secret').fill('s');
  await expect(page.getByText('Enter your API key and secret first')).toBeHidden();
  await page.getByLabel('API key').fill('');
  await expect(page.getByText('Enter your API key and secret first')).toBeVisible();
});
