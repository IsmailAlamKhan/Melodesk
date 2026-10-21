import { expect, test } from '@playwright/test';
import { TRACK, installTauri, startPlayback } from './mock-tauri';

test.beforeEach(async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
});

test('Settings offers every lyrics source, each off until you choose it', async ({ page }) => {
  await page.getByRole('link', { name: 'Settings' }).click();
  for (const name of ['LRCLIB lyrics', 'NetEase lyrics', 'lyrics.ovh'])
    await expect(page.getByRole('switch', { name: `Enable ${name}` })).not.toBeChecked();
});

test('turning on NetEase gives timed lyrics in Now Playing', async ({ page }) => {
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('switch', { name: 'Enable NetEase lyrics' }).check();
  await page.getByRole('link', { name: 'Home' }).first().click();
  await startPlayback(page, {
    positionS: 6,
    track: { ...TRACK, artworkUrl: 'https://i.ytimg.com/vi/sample/hq720.jpg' },
  });
  await page.getByRole('button', { name: 'Open now playing' }).click();
  const view = page.getByRole('region', { name: /now playing/iu });
  await expect(view.getByText('First netease line')).toBeVisible();
  await expect(view.getByText('Third netease line')).toBeVisible();
  // The credit line NetEase puts first is not part of the song.
  await expect(view.getByText('作词')).toHaveCount(0);
  await expect(view.getByText('Lyrics from NetEase Cloud Music')).toBeVisible();
});
