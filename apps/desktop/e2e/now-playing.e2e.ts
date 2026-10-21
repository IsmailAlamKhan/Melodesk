import { expect, test } from '@playwright/test';
import { TRACK, emit, installTauri, sentCommands, startPlayback } from './mock-tauri';

test.beforeEach(async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await startPlayback(page, {
    positionS: 30,
    track: { ...TRACK, artworkUrl: 'https://i.ytimg.com/vi/sample/hq720.jpg' },
  });
  await emit(page, {
    type: 'queue',
    queue: {
      index: 0,
      shuffle: false,
      repeat: 'off',
      autoplay: true,
      title: 'Sample mix',
      items: ['One', 'Two', 'Three'].map((title, i) => ({
        videoId: `vid${String(i)}`,
        title,
        artist: 'Test Artist',
        album: null,
        artworkUrl: null,
        durationSeconds: 180,
        endpoint: null,
        isAutomix: false,
      })),
    },
  });
  await page.getByRole('button', { name: 'Open now playing' }).click();
});

test('shows where the song is playing from, and the lyrics and queue as tabs', async ({ page }) => {
  const view = page.getByRole('region', { name: /now playing/iu });
  await expect(view.getByText('Playing from').first()).toBeVisible();
  await expect(view.getByRole('tab', { name: 'Lyrics' })).toHaveAttribute('aria-selected', 'true');
  await view.getByRole('tab', { name: 'Queue' }).click();
  await expect(view.getByRole('tab', { name: 'Queue' })).toHaveAttribute('aria-selected', 'true');
  await expect(view.getByText('Three')).toBeVisible();
  // Jump to a song from the queue without leaving the player.
  await view.getByText('Two').click();
  expect(await sentCommands(page)).toContainEqual({ type: 'queueSelect', index: 1 });
});

test('remembers the tab you chose', async ({ page }) => {
  await page.getByRole('tab', { name: 'Queue' }).click();
  await page.reload();
  await startPlayback(page, {
    track: { ...TRACK, artworkUrl: 'https://i.ytimg.com/vi/sample/hq720.jpg' },
  });
  await page.getByRole('button', { name: 'Open now playing' }).click();
  await expect(page.getByRole('tab', { name: 'Queue' })).toHaveAttribute('aria-selected', 'true');
});

test('the artwork stays square, and the like button works', async ({ page }) => {
  const view = page.getByRole('region', { name: /now playing/iu });
  const art = view.locator('[class*="aspect-square"]').first();
  const box = await art.boundingBox();
  expect(box).not.toBeNull();
  expect(Math.abs((box?.width ?? 0) - (box?.height ?? 1))).toBeLessThan(2);
  await expect(view.getByRole('button', { name: 'Like', exact: true })).toBeVisible();
});
