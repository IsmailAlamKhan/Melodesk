import { expect, test, type Page } from '@playwright/test';
import { emit, installTauri, sentCommands } from './mock-tauri';
import { openSettings } from './settings-nav';

const ready = { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true };

// A switch is named by its title and then its description.
const toggle = (page: Page, name: string) =>
  page.getByRole('switch', { name: new RegExp(`^${name} [A-Z]`, 'u') });

test('switching YouTube Music off closes the web player and leaves your own music', async ({
  page,
}) => {
  await installTauri(page);
  await page.goto('/');
  await emit(page, ready);
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByRole('link', { name: 'Home' })).toBeVisible();

  await openSettings(page, 'Features');
  await toggle(page, 'YouTube Music').uncheck();
  await expect
    .poll(
      async () =>
        (await sentCommands(page)).filter((c) => c['type'] === 'youtube_set_enabled').at(-1)?.[
          'enabled'
        ],
    )
    .toBe(false);

  // The pages that browse it go with it; what does not need it stays, and is where you land.
  await expect(nav.getByRole('link', { name: 'Home' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Search' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Local music' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Settings' })).toBeVisible();
  await nav.getByRole('link', { name: 'Local music' }).click();
  await expect(page.getByRole('heading', { name: 'Local music' }).first()).toBeVisible();

  // Switching it on again brings it all back and starts the web player.
  await openSettings(page, 'Features');
  await toggle(page, 'YouTube Music').check();
  await expect
    .poll(
      async () =>
        (await sentCommands(page)).filter((c) => c['type'] === 'youtube_set_enabled').at(-1)?.[
          'enabled'
        ],
    )
    .toBe(true);
  await expect(nav.getByRole('link', { name: 'Home' })).toBeVisible();
});

test('with YouTube Music off from the start, the app opens on your own music', async ({ page }) => {
  await installTauri(page, { kv: { 'features:overrides': '{"youtube-music":false}' } });
  await page.addInitScript(() => {
    localStorage.setItem('melodesk.features', '{"youtube-music":false}');
  });
  await page.goto('/');
  const nav = page.getByRole('navigation', { name: 'Primary' });
  await expect(nav.getByRole('link', { name: 'Local music' })).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Home' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Local music' }).first()).toBeVisible();
});
