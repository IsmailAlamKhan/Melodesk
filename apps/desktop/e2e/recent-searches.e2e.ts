import { expect, test, type Page } from '@playwright/test';
import { emit, installTauri } from './mock-tauri';

test.beforeEach(async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
});

const box = (page: Page) => page.getByRole('combobox', { name: /Search/u });

test('the search box offers what you searched for before, and can forget it', async ({ page }) => {
  await box(page).fill('daft punk');
  await box(page).press('Enter');
  await expect(page.getByText('Instant Crush (feat. Julian Casablancas)').first()).toBeVisible();
  await box(page).fill('');
  await box(page).focus();
  const recent = page.getByRole('listbox', { name: 'Recent searches' });
  await expect(recent.getByRole('option', { name: 'daft punk' })).toBeVisible();
  // They survive a reload: they are kept on this computer.
  await page.reload();
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await box(page).focus();
  await expect(recent.getByRole('option', { name: 'daft punk' })).toBeVisible();
  // Choosing one searches again.
  await page.getByRole('link', { name: 'Home' }).first().click();
  await box(page).focus();
  await recent.getByRole('option', { name: 'daft punk' }).click();
  await expect(page.getByText('Instant Crush (feat. Julian Casablancas)').first()).toBeVisible();
  // And one click clears the lot.
  await box(page).fill('');
  await box(page).focus();
  await recent.getByRole('option', { name: 'Clear recent searches' }).click();
  await box(page).focus();
  await expect(recent).toHaveCount(0);
});
