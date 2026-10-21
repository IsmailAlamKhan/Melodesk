import { expect, test, type Page } from '@playwright/test';
import { emit, installTauri } from './mock-tauri';

/** Start recording whether the browser runs a transition on the primary colour. */
const watchFade = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const w = window as unknown as { __fade: boolean };
    w.__fade = false;
    document.documentElement.addEventListener('transitionrun', (e) => {
      if (e.propertyName === '--color-primary') w.__fade = true;
    });
  });

/** Whether a transition on the primary colour has started since `watchFade`. */
const sawFade = (page: Page): Promise<boolean> =>
  page.evaluate(() => (window as unknown as { __fade: boolean }).__fade);

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
  await watchFade(page);
  await page.getByRole('radio', { name: 'Green' }).click();
  // The browser started a transition (an event, so it does not depend on when we look).
  await expect.poll(() => sawFade(page), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => primary(page), { timeout: 15_000 }).not.toBe(before);
});

test('switching theme fades too', async ({ page }) => {
  await openAppearance(page);
  await page.getByRole('radio', { name: 'Dark', exact: true }).click();
  await expect.poll(() => primary(page), { timeout: 15_000 }).toMatch(/^rgb/u);
  const dark = await primary(page);
  await watchFade(page);
  await page.getByRole('radio', { name: 'Light', exact: true }).click();
  await expect.poll(() => sawFade(page), { timeout: 15_000 }).toBe(true);
  await expect.poll(() => primary(page), { timeout: 15_000 }).not.toBe(dark);
});

test('with reduced motion the change is immediate', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await openAppearance(page);
  const before = await primary(page);
  await watchFade(page);
  await page.getByRole('radio', { name: 'Green' }).click();
  await expect.poll(() => primary(page), { timeout: 15_000 }).not.toBe(before);
  expect(await sawFade(page)).toBe(false);
});
