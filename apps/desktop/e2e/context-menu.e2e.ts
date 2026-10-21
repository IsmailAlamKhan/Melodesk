import { expect, test } from '@playwright/test';
import { emit, installTauri, sentCommands, startPlayback } from './mock-tauri';

test.beforeEach(async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
});

test('right-clicking the page offers navigation and views', async ({ page }) => {
  await page.getByRole('heading', { name: 'Indian Music' }).click({ button: 'right' });
  const menu = page.getByRole('menu');
  for (const name of ['Back', 'Forward', 'Go to', 'View', 'Command palette', 'Settings'])
    await expect(menu.getByRole('menuitem', { name })).toBeVisible();
  // Navigation and views are grouped one level down.
  await menu.getByRole('menuitem', { name: 'Go to' }).click();
  for (const name of [/^Home/u, /^Explore/u, /^Library/u, /^Search/u])
    await expect(page.getByRole('menuitem', { name })).toBeVisible();
  // Nothing is playing, so no playback controls yet.
  await expect(menu.getByRole('menuitem', { name: 'Next' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(menu).toBeHidden();
});

test('a menu choice acts: Settings opens the settings page', async ({ page }) => {
  await page.getByRole('heading', { name: 'Indian Music' }).click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Storage' })).toBeVisible();
});

test('with a track playing the menu leads with playback controls that work', async ({ page }) => {
  await startPlayback(page);
  await page.locator('footer').click({ button: 'right', position: { x: 6, y: 40 } });
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Pause' })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'View' }).click();
  await expect(page.getByRole('menuitem', { name: 'Karaoke mode' })).toBeVisible();
  await menu.getByRole('menuitem', { name: 'Next' }).click();
  expect((await sentCommands(page)).some((c) => c['type'] === 'next')).toBe(true);
});

test('text fields get cut, copy, paste and select all', async ({ page }) => {
  const box = page.getByRole('combobox');
  await box.fill('daft punk');
  await box.click({ button: 'right' });
  const menu = page.getByRole('menu');
  await expect(menu.getByRole('menuitem', { name: 'Paste' })).toBeVisible();
  // Nothing is selected yet, so cut and copy are unavailable.
  await expect(menu.getByRole('menuitem', { name: 'Cut' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await menu.getByRole('menuitem', { name: 'Select all' }).click();
  await box.click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Copy' })).not.toHaveAttribute(
    'aria-disabled',
    'true',
  );
});

test('a card keeps its own menu, and the app menu does not stack on top', async ({ page }) => {
  await page
    .getByRole('region', { name: 'Indian Music' })
    .getByRole('link')
    .first()
    .click({ button: 'right' });
  await expect(page.getByRole('menu')).toHaveCount(1);
  await expect(page.getByRole('menuitem', { name: 'Command palette' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: /queue/iu }).first()).toBeVisible();
});

test('a sidebar link offers Open on top of the app menu', async ({ page }) => {
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Library' })
    .click({ button: 'right' });
  await expect(page.getByRole('menuitem', { name: 'Open' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Command palette' })).toBeVisible();
});
