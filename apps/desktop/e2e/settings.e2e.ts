import { expect, test, type Page } from '@playwright/test';
import { emit, installTauri } from './mock-tauri';
import { openSettings } from './settings-nav';

test.beforeEach(async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
});

const pagesNav = (page: Page) => page.getByRole('navigation', { name: 'Settings pages' });

test('Settings is a list of pages and shows one at a time', async ({ page }) => {
  await openSettings(page);
  for (const name of ['General', 'Appearance', 'Features', 'Plugins', 'Storage', 'About & updates'])
    await expect(pagesNav(page).getByRole('link', { name })).toBeVisible();
  // General is first, with its own sections only.
  await expect(pagesNav(page).getByRole('link', { name: 'General' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await expect(page.getByRole('heading', { name: 'Account' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Desktop' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Updates' })).toHaveCount(0);
  await pagesNav(page).getByRole('link', { name: 'About & updates' }).click();
  await expect(page.getByRole('heading', { name: 'Updates' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Diagnostics' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Account' })).toHaveCount(0);
});

test('Plugins have a page of their own, in groups by what they do', async ({ page }) => {
  await openSettings(page, 'Plugins');
  for (const name of ['Lyrics sources', 'Song recognition', 'Scrobbling & activity'])
    await expect(page.getByRole('group', { name })).toBeVisible();
  const lyrics = page.getByRole('group', { name: 'Lyrics sources' });
  await expect(lyrics.getByRole('switch', { name: 'Enable LRCLIB lyrics' })).toBeVisible();
  await expect(lyrics.getByRole('switch', { name: 'Enable NetEase lyrics' })).toBeVisible();
  await expect(
    page
      .getByRole('group', { name: 'Song recognition' })
      .getByRole('switch', { name: 'Enable Local AI song finder' }),
  ).toBeVisible();
  await expect(
    page
      .getByRole('group', { name: 'Scrobbling & activity' })
      .getByRole('switch', { name: 'Enable Last.fm' }),
  ).toBeVisible();
});

test('a page can be linked to straight from the address', async ({ page }) => {
  await openSettings(page, 'Appearance');
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
  await expect(pagesNav(page).getByRole('link', { name: 'Appearance' })).toHaveAttribute(
    'aria-current',
    'page',
  );
});
