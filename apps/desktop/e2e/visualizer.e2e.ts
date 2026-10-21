import { expect, test } from '@playwright/test';
import { TRACK, installTauri, startPlayback } from './mock-tauri';

test.beforeEach(async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await startPlayback(page, {
    positionS: 20,
    track: { ...TRACK, artworkUrl: 'https://i.ytimg.com/vi/sample/hq720.jpg' },
  });
});

test('the player bar shows bars that move with the music', async ({ page }) => {
  const bars = page.getByRole('contentinfo').locator('span[style*="--b0"]').first();
  await expect(bars).toBeAttached();
  const readings = new Set<string>();
  for (let i = 0; i < 12; i += 1) {
    readings.add(await bars.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--b0')));
    await page.waitForTimeout(120);
  }
  expect(readings.size).toBeGreaterThan(3);
});

test('Now Playing has a Visualizer tab that draws the spectrum', async ({ page }) => {
  await page.getByRole('button', { name: 'Open now playing' }).click();
  await page.getByRole('tab', { name: 'Visualizer' }).click();
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await page.waitForTimeout(800);
  const painted = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const data = c.getContext('2d')?.getImageData(0, 0, c.width, c.height).data;
    if (!data) return 0;
    let n = 0;
    for (let i = 3; i < data.length; i += 4) if ((data[i] ?? 0) > 0) n += 1;
    return n;
  });
  expect(painted).toBeGreaterThan(500);
  for (const mode of ['Wave', 'Ring', 'Bars'])
    await page.getByRole('radio', { name: mode }).click();
  await expect(page.getByText(/cannot hear the sound itself/u)).toBeVisible();
});

test('everything holds still when the music stops', async ({ page }) => {
  await startPlayback(page, { positionS: 20, playing: false, track: TRACK });
  await page.waitForTimeout(1500);
  const bars = page.getByRole('contentinfo').locator('span[style*="--b0"]').first();
  // Paused: the title's bars are gone, so nothing is animating.
  await expect(bars).toHaveCount(0);
});

test('switching the feature off removes the Visualizer tab', async ({ page }) => {
  await page.getByRole('link', { name: 'Settings' }).click();
  await page.getByRole('switch', { name: /^Music visuals [A-Z]/u }).uncheck();
  await page.getByRole('button', { name: 'Open now playing' }).click();
  await expect(page.getByRole('tab', { name: 'Visualizer' })).toHaveCount(0);
});
