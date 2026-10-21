import { expect, test } from '@playwright/test';
import { TRACK, installTauri, startPlayback } from './mock-tauri';

const LONG =
  'Bhool Na Jaana (From “MEMORIES OF A SUMMER NIGHT — The Extended Cinematic Soundtrack”)';

test.beforeEach(async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await startPlayback(page, {
    positionS: 20,
    track: { ...TRACK, title: LONG, artworkUrl: 'https://i.ytimg.com/vi/sample/hq720.jpg' },
  });
});

test('a title that does not fit fades out, explains itself in a tooltip and slides on hover', async ({
  page,
}) => {
  const title = page.getByRole('contentinfo').locator('.marquee').first();
  await expect(title).toHaveAttribute('data-overflow', 'true');
  // Still fully there in the page for screen readers and search, just clipped.
  await expect(title).toContainText('The Extended Cinematic Soundtrack');
  await title.hover();
  await expect(page.getByRole('tooltip').getByText(LONG)).toBeVisible();
  const track = title.locator('.marquee-track');
  await expect
    .poll(async () => track.evaluate((el) => getComputedStyle(el).animationName))
    .toBe('marquee-slide');
  await page.waitForTimeout(1500);
  const moved = await track.evaluate((el) => new DOMMatrix(getComputedStyle(el).transform).m41);
  expect(moved).toBeLessThan(0);
});

test('a short title is left alone', async ({ page }) => {
  await startPlayback(page, { track: { ...TRACK, title: 'Short' } });
  const title = page.getByRole('contentinfo').locator('.marquee').first();
  await expect(title).toHaveAttribute('data-overflow', 'false');
  await title.hover();
  await expect(page.getByRole('tooltip')).toHaveCount(0);
});
