import { expect, test, type Locator, type Page } from '@playwright/test';
import { installTauri, startPlayback } from './mock-tauri';

/** Move the mouse onto an element's centre without Playwright's stability checks (sliders move while playing). */
async function pointAt(page: Page, el: Locator): Promise<void> {
  const box = await el.boundingBox();
  if (!box) throw new Error('element has no box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
}

test.beforeEach(async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
});

test('every control in the player bar explains itself on hover', async ({ page }) => {
  await startPlayback(page, { positionS: 62 });
  const bar = page.getByRole('contentinfo').or(page.locator('footer')).first();
  const cases: [string, string][] = [
    ['Mini player', 'Mini player'],
    ['Now playing', 'Now playing'],
    ['Switch to video', 'Switch to video'],
    ['Mute', 'Mute'],
    ['Shuffle', 'Shuffle'],
    ['Previous', 'Previous'],
    ['Next', 'Next'],
  ];
  for (const [name, text] of cases) {
    await bar.getByRole('button', { name, exact: true }).hover();
    await expect(page.getByRole('tooltip').filter({ hasText: text })).toBeVisible();
    await page.mouse.move(0, 0, { steps: 4 });
    await expect(page.getByRole('tooltip')).toBeHidden();
  }
});

test('sliders show their current value', async ({ page }) => {
  await startPlayback(page, { positionS: 62, playing: false });
  await pointAt(page, page.locator('footer').getByRole('slider', { name: 'Volume' }));
  await expect(page.getByRole('tooltip').filter({ hasText: 'Volume · 50%' })).toBeVisible();
  await page.mouse.move(0, 0, { steps: 4 });
  await pointAt(page, page.locator('footer').getByRole('slider', { name: 'Seek' }));
  await expect(page.getByRole('tooltip').filter({ hasText: 'Seek · 1:02' })).toBeVisible();
});

test('a disabled control still explains itself', async ({ page }) => {
  // Disabled buttons get no pointer events; the tooltip hangs off a wrapper around them.
  const disabled = page.locator('footer').getByRole('button', { name: 'Now playing', exact: true });
  await expect(disabled).toBeDisabled();
  await pointAt(page, disabled.locator('..'));
  await expect(page.getByRole('tooltip').filter({ hasText: 'Now playing' })).toBeVisible();
});

test('icon-only buttons elsewhere have tooltips too', async ({ page }) => {
  await page.getByRole('button', { name: 'Back' }).hover();
  await expect(page.getByRole('tooltip').filter({ hasText: 'Back' })).toBeVisible();
  await page.mouse.move(0, 0, { steps: 4 });
  await page.getByRole('combobox').fill('x');
  await page.getByRole('button', { name: 'Clear' }).hover();
  await expect(page.getByRole('tooltip').filter({ hasText: 'Clear' })).toBeVisible();
});
