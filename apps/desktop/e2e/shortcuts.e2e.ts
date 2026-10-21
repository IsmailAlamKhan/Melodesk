import { expect, test } from '@playwright/test';
import { emit, installTauri, sentCommands } from './mock-tauri';

test.beforeEach(async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Settings' })
    .click();
});

test('global shortcuts start unset', async ({ page }) => {
  const field = page.getByRole('button', { name: 'Set shortcut' });
  await expect(field).toHaveCount(7);
  await expect(page.getByText('Not set')).toHaveCount(7);
});

test('a combination that selects text in other apps is refused, with the reason', async ({
  page,
}) => {
  const field = page.getByRole('button', { name: 'Set shortcut' }).first();
  await field.click();
  await page.keyboard.press('Meta+Shift+ArrowRight');
  await expect(page.getByRole('alert').filter({ hasText: 'move or select text' })).toBeVisible();
  await expect(field).toContainText('Not set');
  expect((await sentCommands(page)).some((c) => c['type'] === 'set_settings')).toBe(false);
});

test('copy and paste combinations are refused too', async ({ page }) => {
  await page.getByRole('button', { name: 'Set shortcut' }).first().click();
  await page.keyboard.press('Meta+C');
  await expect(
    page.getByRole('alert').filter({ hasText: 'select all, copy, paste' }),
  ).toBeVisible();
});

test('an ordinary combination is saved', async ({ page }) => {
  await page.getByRole('button', { name: 'Set shortcut' }).first().click();
  await page.keyboard.press('Meta+Alt+M');
  const saved = (await sentCommands(page)).find((c) => c['type'] === 'set_settings') as
    { settings: { shortcuts: { playPause: string } } } | undefined;
  expect(saved?.settings.shortcuts.playPause).toBe('CommandOrControl+Alt+M');
});
