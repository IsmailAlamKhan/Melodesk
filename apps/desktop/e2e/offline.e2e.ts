import { expect, test } from '@playwright/test';
import { emit, installTauri } from './mock-tauri';

test('the app says when it is offline, and stops saying so when it is back', async ({
  page,
  context,
}) => {
  await installTauri(page);
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await expect(page.getByRole('status')).toHaveCount(0);
  await context.setOffline(true);
  await expect(page.getByRole('status')).toContainText('You are offline');
  await context.setOffline(false);
  await expect(page.getByRole('status')).toHaveCount(0);
});
