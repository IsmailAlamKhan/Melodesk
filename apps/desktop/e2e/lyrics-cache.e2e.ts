import { expect, test } from '@playwright/test';
import { TRACK, installTauri, startPlayback } from './mock-tauri';
import { openSettings } from './settings-nav';

const track = { ...TRACK, artworkUrl: 'https://i.ytimg.com/vi/sample/hq720.jpg' };
const LRC = '[00:01.00] Kept line one\n[00:05.00] Kept line two\n[00:09.00] Kept line three';

test('lyrics that were found show again after a restart without asking anyone', async ({
  page,
}) => {
  let asked = 0;
  let down = false;
  await installTauri(page, {
    http: (url) => {
      if (!url.includes('lrclib.net')) return null;
      asked += 1;
      if (down) return { status: 503, body: {} };
      return {
        status: 200,
        body: {
          trackName: 'Test Song',
          artistName: 'Test Artist',
          duration: 200,
          syncedLyrics: LRC,
          plainLyrics: 'x',
        },
      };
    },
  });
  await page.goto('/');
  await openSettings(page, 'Plugins');
  await page.getByRole('switch', { name: 'Enable LRCLIB lyrics' }).check();
  await startPlayback(page, { positionS: 2, track });
  await page.getByRole('button', { name: 'Open now playing' }).click();
  await expect(page.getByText('Kept line one')).toBeVisible();
  expect(asked).toBeGreaterThan(0);
  // The cache is written a moment after the answer arrives.
  await page.waitForTimeout(3000);

  // A new session with the source unreachable: the lyrics come from the saved copy.
  down = true;
  const before = asked;
  await page.reload();
  await startPlayback(page, { positionS: 2, track });
  await page.getByRole('button', { name: 'Open now playing' }).click();
  await expect(page.getByText('Kept line one')).toBeVisible();
  expect(asked).toBe(before);
});

test('a song nobody has lyrics for is not searched for again on every launch', async ({ page }) => {
  let asked = 0;
  await installTauri(page, {
    youtubeLyrics: false,
    http: (url) => {
      if (!url.includes('lrclib.net')) return null;
      asked += 1;
      return url.includes('/api/get') ? { status: 404, body: {} } : { status: 200, body: [] };
    },
  });
  await page.goto('/');
  await openSettings(page, 'Plugins');
  await page.getByRole('switch', { name: 'Enable LRCLIB lyrics' }).check();
  await startPlayback(page, { positionS: 2, track });
  await page.getByRole('button', { name: 'Open now playing' }).click();
  await expect(page.getByText('No lyrics available for this song.')).toBeVisible();
  expect(asked).toBeGreaterThan(0);
  await page.waitForTimeout(3000);

  const before = asked;
  await page.reload();
  await startPlayback(page, { positionS: 2, track });
  await page.getByRole('button', { name: 'Open now playing' }).click();
  await expect(page.getByText('No lyrics available for this song.')).toBeVisible();
  await page.waitForTimeout(1500);
  expect(asked).toBe(before);
});
