import { expect, test, type Page } from '@playwright/test';
import { emit, installTauri } from './mock-tauri';
import { openSettings } from './settings-nav';

test.beforeEach(async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
});

const sidebar = (page: Page) => page.getByRole('navigation').first();
// A switch is named by its title and then its description, so match the title exactly.
const toggle = (page: Page, name: string) =>
  page.getByRole('switch', { name: new RegExp(`^${name} [A-Z]`, 'u') });

async function openFeatures(page: Page): Promise<void> {
  await openSettings(page, 'Features');
}

test('Settings lists the optional features and leaves the essential ones out', async ({ page }) => {
  await openFeatures(page);
  for (const name of ['Listening stats', 'Queue', 'Lyrics', 'Karaoke mode', 'Mini player'])
    await expect(toggle(page, name)).toBeVisible();
  for (const name of ['Home', 'Settings', 'Search'])
    await expect(toggle(page, name)).toHaveCount(0);
});

test('switching a feature off removes it from the sidebar and its page, and back on restores it', async ({
  page,
}) => {
  await expect(sidebar(page).getByRole('link', { name: 'Stats' })).toBeVisible();
  await openFeatures(page);
  await toggle(page, 'Listening stats').uncheck();
  await expect(sidebar(page).getByRole('link', { name: 'Stats' })).toHaveCount(0);
  // The route went with it: the address falls back to Home.
  await page.getByRole('link', { name: 'Home' }).first().click();
  await expect(page.getByRole('heading', { name: 'Indian Music' })).toBeVisible();

  await openSettings(page, 'Features');
  await toggle(page, 'Listening stats').check();
  await expect(sidebar(page).getByRole('link', { name: 'Stats' })).toBeVisible();
});

test('switching off the queue also switches off the tools that live in it', async ({ page }) => {
  await expect(page.getByRole('button', { name: 'Queue' })).toBeVisible();
  await openFeatures(page);
  await expect(toggle(page, 'Queue')).toBeChecked();
  await expect(toggle(page, 'Queue tools')).toBeChecked();
  await toggle(page, 'Queue').uncheck();
  await expect(toggle(page, 'Queue tools')).not.toBeChecked();
  await expect(page.getByRole('button', { name: 'Queue' })).toHaveCount(0);
  // Turning the tools on brings the queue back, since they need it.
  await toggle(page, 'Queue tools').check();
  await expect(toggle(page, 'Queue')).toBeChecked();
  await expect(page.getByRole('button', { name: 'Queue' })).toBeVisible();
});

test('a feature takes its settings page with it', async ({ page }) => {
  await openFeatures(page);
  const pages = page.getByRole('navigation', { name: 'Settings pages' });
  await expect(pages.getByRole('link', { name: 'Storage' })).toBeVisible();
  // Several features have sections on the Storage page; it is gone only when all are off.
  await toggle(page, 'Offline cover art').uncheck();
  await expect(pages.getByRole('link', { name: 'Storage' })).toBeVisible();
  await toggle(page, 'Local music').uncheck();
  await toggle(page, 'Backup and restore').uncheck();
  await expect(pages.getByRole('link', { name: 'Storage' })).toHaveCount(0);
  await toggle(page, 'Offline cover art').check();
  await toggle(page, 'Local music').check();
  await toggle(page, 'Backup and restore').check();
  await expect(pages.getByRole('link', { name: 'Storage' })).toBeVisible();
  await pages.getByRole('link', { name: 'Storage' }).click();
  await expect(page.getByRole('heading', { name: 'Storage' })).toBeVisible();
});

test('the choice is remembered after a reload', async ({ page }) => {
  await openFeatures(page);
  await toggle(page, 'Listening stats').uncheck();
  await page.reload();
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await expect(page.getByRole('heading', { name: 'Indian Music' })).toBeVisible();
  await expect(sidebar(page).getByRole('link', { name: 'Stats' })).toHaveCount(0);
});

test('the command palette only offers what is switched on', async ({ page }) => {
  await page.keyboard.press('ControlOrMeta+K');
  await expect(page.getByRole('option', { name: /listening stats/iu }).first()).toBeVisible();
  await page.keyboard.press('Escape');
  await openFeatures(page);
  await toggle(page, 'Listening stats').uncheck();
  await page.keyboard.press('ControlOrMeta+K');
  await expect(page.getByRole('listbox')).toBeVisible();
  await expect(page.getByRole('option', { name: /listening stats/iu })).toHaveCount(0);
});
