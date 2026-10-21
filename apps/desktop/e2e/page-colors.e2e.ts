import { expect, test, type Page } from '@playwright/test';
import { emit, installTauri } from './mock-tauri';

test.beforeEach(async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
});

const primary = (page: Page, selector: string): Promise<string> =>
  page.evaluate(
    (sel) =>
      getComputedStyle(document.querySelector(sel) ?? document.body)
        .getPropertyValue('--color-primary')
        .trim(),
    selector,
  );

async function openPlaylist(page: Page): Promise<void> {
  await page
    .getByRole('link', { name: /Uncut Bollywood/u })
    .first()
    .click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
}

test('a playlist page takes the colours of its artwork and gives them back on leaving', async ({
  page,
}) => {
  const app = await primary(page, 'html');
  await openPlaylist(page);
  const scope = page.locator('[data-themed="true"]');
  await expect(scope).toBeVisible();
  // Wait for the cross-fade to finish, then compare with the app's own colour.
  await page.waitForTimeout(700);
  expect(await primary(page, '[data-themed="true"]')).not.toBe(app);
  // The sidebar is outside the page and keeps the app's colours.
  expect(await primary(page, 'nav')).toBe(app);
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Home' })
    .click();
  await expect(page.locator('[data-themed="true"]')).toHaveCount(0);
});

test('it can be turned off in Settings', async ({ page }) => {
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await page.getByRole('switch', { name: 'Color pages from artwork' }).uncheck();
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Home' })
    .click();
  await openPlaylist(page);
  await page.waitForTimeout(500);
  await expect(page.locator('[data-themed="true"]')).toHaveCount(0);
});
