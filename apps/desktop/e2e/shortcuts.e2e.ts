import { expect, test, type Locator, type Page } from '@playwright/test';
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

test('Escape cancels recording and keeps the old value', async ({ page }) => {
  const field = page.getByRole('button', { name: 'Set shortcut' }).first();
  await field.click();
  await expect(field).toContainText('Press keys');
  // The how-to is part of the section text, so recording never changes the layout.
  await expect(page.getByText(/Esc cancels and Backspace clears/u)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(field).toContainText('Not set');
  expect((await sentCommands(page)).some((c) => c['type'] === 'set_settings')).toBe(false);
});

test('works when the button did not take keyboard focus (macOS WebKit)', async ({ page }) => {
  const field = page.getByRole('button', { name: 'Set shortcut' }).first();
  await field.click();
  // Safari/WKWebView do not focus a button on click; simulate that by dropping the focus.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(field).toContainText('Press keys');
  await page.keyboard.press('Meta+Alt+M');
  const saved = (await sentCommands(page)).find((c) => c['type'] === 'set_settings') as
    { settings: { shortcuts: { playPause: string } } } | undefined;
  expect(saved?.settings.shortcuts.playPause).toBe('CommandOrControl+Alt+M');
});

/** Every shortcut field, whether or not it has a value (its label changes once assigned). */
const anyField = (page: Page): Locator =>
  page.getByRole('button', { name: /^(Set shortcut|Shortcut )/u });

test('Backspace clears an assigned shortcut', async ({ page }) => {
  const field = anyField(page).first();
  await field.click();
  await page.keyboard.press('Meta+Alt+M');
  await expect(field).not.toContainText('Not set');
  await field.click();
  await page.keyboard.press('Backspace');
  await expect(field).toContainText('Not set');
});

test('only one field records at a time, and a click elsewhere cancels', async ({ page }) => {
  const fields = anyField(page);
  await fields.nth(0).click();
  await fields.nth(1).click();
  await expect(page.getByText('Press keys…')).toHaveCount(1);
  await page.getByRole('heading', { name: 'Global shortcuts' }).click();
  await expect(page.getByText('Press keys…')).toHaveCount(0);
});
