import { expect, test, type Locator } from '@playwright/test';
import { emit, installTauri, startPlayback } from './mock-tauri';

const cursorOf = (el: Locator): Promise<string> =>
  el.evaluate((node) => getComputedStyle(node).cursor);

test('clickable controls show a pointer, text fields an I-beam, disabled controls the arrow', async ({
  page,
}) => {
  await installTauri(page);
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await expect(page.getByRole('heading', { name: 'Indian Music' })).toBeVisible();

  expect(await cursorOf(page.getByRole('button', { name: 'Back' }))).toBe('pointer');
  expect(
    await cursorOf(
      page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Library' }),
    ),
  ).toBe('pointer');
  expect(await cursorOf(page.getByRole('combobox'))).toBe('text');
  // Nothing is playing yet, so Now playing is disabled.
  expect(
    await cursorOf(
      page.locator('footer').getByRole('button', { name: 'Now playing', exact: true }),
    ),
  ).toBe('default');

  await startPlayback(page);
  expect(await cursorOf(page.locator('footer').getByRole('button', { name: 'Pause' }))).toBe(
    'pointer',
  );
  expect(await cursorOf(page.locator('footer').getByRole('slider', { name: 'Volume' }))).toBe(
    'pointer',
  );
  expect(await cursorOf(page.locator('footer [data-slider-root]').first())).toBe('pointer');
});
