import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { emit, installTauri, startPlayback, TRACK } from './mock-tauri';

const out = join(dirname(fileURLToPath(import.meta.url)), '../../../docs/screenshots');
mkdirSync(out, { recursive: true });

// Invented lyrics: screenshots never reproduce a real song's words.
const LRCLIB = {
  plainLyrics: 'x',
  syncedLyrics: [
    '[00:08.00] Streetlights hum a quiet tune',
    '[00:12.50] While the city starts to sleep',
    '[00:17.00] Carry me past the edge of June',
    '[00:21.50] Where the promises we keep',
    '[00:40.00] Sing it out, sing it loud',
    '[00:44.00] We are louder than the crowd',
  ].join('\n'),
};
const SAMPLE = {
  ...TRACK,
  title: 'Sample Song',
  artist: 'Sample Artist',
  album: 'Sample Album',
  artworkUrl: 'https://i.ytimg.com/vi/sample/hq720.jpg',
};

async function shot(page: Page, name: string): Promise<void> {
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(out, `${name}.png`) });
}

async function enableLrclib(scope: Page | Locator): Promise<void> {
  await scope
    .getByRole('button', { name: /Get timed lyrics from LRCLIB/u })
    .first()
    .click();
}

test('home', async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await startPlayback(page, { positionS: 62, track: SAMPLE });
  await expect(page.getByRole('heading', { name: 'Indian Music' })).toBeVisible();
  await shot(page, 'home');
});

test('search', async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await startPlayback(page, { positionS: 62, track: SAMPLE });
  const box = page.getByRole('combobox');
  await box.fill('daft punk');
  await box.press('Enter');
  await expect(page.getByText('Instant Crush (feat. Julian Casablancas)').first()).toBeVisible();
  await shot(page, 'search');
});

test('lyrics panel', async ({ page }) => {
  await installTauri(page, { lrclib: LRCLIB });
  await page.goto('/');
  await startPlayback(page, { positionS: 14, track: SAMPLE });
  await page.getByRole('button', { name: 'Lyrics', exact: true }).first().click();
  await enableLrclib(page);
  await expect(page.getByText('Streetlights hum a quiet tune').first()).toBeVisible();
  await shot(page, 'lyrics');
});

test('karaoke', async ({ page }) => {
  await installTauri(page, { lrclib: LRCLIB });
  await page.goto('/');
  await startPlayback(page, { positionS: 13.4, track: SAMPLE });
  await page.getByRole('button', { name: 'Now playing', exact: true }).click();
  await page.getByRole('button', { name: 'Karaoke mode' }).first().click();
  const karaoke = page.getByRole('region', { name: 'Karaoke' });
  await enableLrclib(karaoke);
  await expect(karaoke.getByText('Carry me past the edge of June')).toBeVisible();
  await shot(page, 'karaoke');
});

test('light theme with a custom accent', async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem(
      'melodesk.appearance',
      JSON.stringify({
        theme: 'light',
        accent: { kind: 'custom', hex: '#7c3aed' },
        density: 'comfortable',
        direction: 'auto',
        language: 'system',
      }),
    );
  });
  await installTauri(page);
  await page.goto('/');
  await startPlayback(page, { positionS: 62, track: SAMPLE });
  await expect(page.getByRole('heading', { name: 'Indian Music' })).toBeVisible();
  await emit(page, {
    type: 'flags',
    flags: { likeStatus: 'LIKE', playbackRate: 1, isVideo: false, adPlaying: false },
  });
  await shot(page, 'light');
});

test('right-click menus', async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await startPlayback(page, { positionS: 62, track: SAMPLE });
  await expect(page.getByRole('heading', { name: 'Indian Music' })).toBeVisible();
  await page.mouse.click(1000, 125, { button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  await shot(page, 'context-menu');
  await page.keyboard.press('Escape');
  await page
    .getByRole('region', { name: 'Indian Music' })
    .getByRole('link')
    .nth(1)
    .click({ button: 'right' });
  await expect(page.getByRole('menu')).toBeVisible();
  await shot(page, 'context-menu-item');
});

test('settings', async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await startPlayback(page, { positionS: 62, track: SAMPLE });
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Settings' })
    .click();
  await expect(page.getByRole('heading', { name: 'Appearance' })).toBeVisible();
  await page.getByRole('heading', { name: 'Appearance' }).scrollIntoViewIfNeeded();
  await shot(page, 'settings');
});

test('playlist page', async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await startPlayback(page, { positionS: 62, track: SAMPLE });
  await page.getByRole('region', { name: 'Indian Music' }).getByRole('link').first().click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await shot(page, 'playlist');
});

test('card hover', async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await startPlayback(page, { positionS: 62, track: SAMPLE });
  await expect(page.getByRole('heading', { name: 'Indian Music' })).toBeVisible();
  await page.mouse.move(512, 280, { steps: 6 });
  await page.waitForTimeout(600);
  await page.screenshot({
    path: join(out, 'card-hover.png'),
    clip: { x: 220, y: 130, width: 760, height: 300 },
  });
});
