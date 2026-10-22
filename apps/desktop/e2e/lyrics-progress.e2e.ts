import { expect, test } from '@playwright/test';
import { TRACK, installTauri, startPlayback } from './mock-tauri';
import { openSettings } from './settings-nav';

const track = { ...TRACK, artworkUrl: 'https://i.ytimg.com/vi/sample/hq720.jpg' };

test('while lyrics are looked up, the view says where it is asking and how each went', async ({
  page,
}) => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await installTauri(page, {
    youtubeLyrics: false,
    http: async (url) => {
      if (!url.includes('lrclib.net')) return null;
      await gate;
      return url.includes('/api/get') ? { status: 404, body: {} } : { status: 200, body: [] };
    },
  });
  await page.goto('/');
  await openSettings(page, 'Plugins');
  await page.getByRole('switch', { name: 'Enable LRCLIB lyrics' }).check();
  await startPlayback(page, { positionS: 2, track });
  await page.getByRole('button', { name: 'Open now playing' }).click();

  const status = page.getByRole('region', { name: /now playing/iu }).getByRole('status');
  await expect(status).toContainText('Looking for lyrics…');
  await expect(status).toContainText('YouTube Music');
  await expect(status).toContainText('Nothing found');
  await expect(status).toContainText('LRCLIB lyrics');
  await expect(status).toContainText('Trying “Test Song”');

  release();
  await expect(page.getByText('No lyrics available for this song.')).toBeVisible();
});
