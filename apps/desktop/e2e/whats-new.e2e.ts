import { expect, test, type Page } from '@playwright/test';
import { emit, installTauri } from './mock-tauri';

const ready = { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true };
const dialogOf = (page: Page) => page.getByRole('dialog', { name: 'What’s new' });

test('after an update, what is new is shown once', async ({ page }) => {
  await installTauri(page, { appVersion: '0.7.0', kv: { 'whats-new:seen': '0.5.0' } });
  await page.goto('/');
  await emit(page, ready);
  const dialog = dialogOf(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText('Melodesk was updated. Here is what changed.')).toBeVisible();
  // Only what came after the last version run, up to the one running.
  await expect(dialog.getByRole('region', { name: 'Version 0.7.0' })).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Version 0.6.0' })).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Version 0.5.0' })).toHaveCount(0);
  await expect(dialog.getByRole('region', { name: 'Version 0.8.0' })).toHaveCount(0);
  await dialog.getByRole('button', { name: 'Got it' }).click();
  await expect(dialog).toHaveCount(0);
  // Not again after a reload.
  await page.reload();
  await emit(page, ready);
  await expect(page.getByRole('link', { name: 'Home' }).first()).toBeVisible();
  await expect(dialogOf(page)).toHaveCount(0);
});

test('a first run stays quiet, and the whole list opens from the command palette', async ({
  page,
}) => {
  await installTauri(page, { appVersion: '0.7.0' });
  await page.goto('/');
  await emit(page, ready);
  await expect(page.getByRole('link', { name: 'Home' }).first()).toBeVisible();
  await expect(dialogOf(page)).toHaveCount(0);
  await page.keyboard.press('ControlOrMeta+K');
  await page.getByRole('combobox').last().fill('what');
  await page.getByRole('option', { name: /What’s new/u }).click();
  const dialog = dialogOf(page);
  await expect(dialog.getByText('What each version of Melodesk added.')).toBeVisible();
  await expect(dialog.getByRole('region', { name: 'Version 0.3.0' })).toBeVisible();
});
