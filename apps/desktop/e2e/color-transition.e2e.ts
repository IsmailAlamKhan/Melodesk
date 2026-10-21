import { expect, test, type Page } from '@playwright/test';
import { emit, installTauri } from './mock-tauri';

const primary = (page: Page): Promise<string> =>
  page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim(),
  );

async function openAppearance(page: Page): Promise<void> {
  await installTauri(page);
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
}

test('changing the accent fades the colours instead of switching instantly', async ({ page }) => {
  await openAppearance(page);
  const before = await primary(page);
  await page.getByRole('radio', { name: 'Green' }).click();
  await page.waitForTimeout(120);
  const during = await primary(page);
  await page.waitForTimeout(900);
  const after = await primary(page);
  expect(after).not.toBe(before);
  // Part-way through, the colour is neither where it started nor where it ends up.
  expect(during).not.toBe(before);
  expect(during).not.toBe(after);
});

test('switching theme fades too', async ({ page }) => {
  await openAppearance(page);
  await page.getByRole('radio', { name: 'Dark', exact: true }).click();
  await page.waitForTimeout(900);
  const dark = await primary(page);
  await page.getByRole('radio', { name: 'Light', exact: true }).click();
  await page.waitForTimeout(120);
  const during = await primary(page);
  await page.waitForTimeout(900);
  const light = await primary(page);
  expect(light).not.toBe(dark);
  expect(during).not.toBe(dark);
  expect(during).not.toBe(light);
});

test('with reduced motion the change is immediate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAppearance(page);
  const before = await primary(page);
  await page.getByRole('radio', { name: 'Green' }).click();
  await page.waitForTimeout(60);
  const soon = await primary(page);
  await page.waitForTimeout(500);
  const after = await primary(page);
  expect(after).not.toBe(before);
  expect(soon).toBe(after);
});
