import { expect, test, type Page } from '@playwright/test';
import { TRACK, installTauri, setPosition, startPlayback } from './mock-tauri';

const LRCLIB = {
  plainLyrics: 'Hello from the other side\nI must have called a thousand times',
  syncedLyrics:
    '[00:10.00] Hello from the other side\n[00:14.00] I must have called a thousand times\n[00:30.00] To tell you I am sorry',
};

async function openKaraoke(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Now playing', exact: true }).click();
  await page.getByRole('button', { name: 'Karaoke mode' }).first().click();
  await expect(page.getByRole('region', { name: 'Karaoke' })).toBeVisible();
}

test.describe('without timed lyrics', () => {
  test.beforeEach(async ({ page }) => {
    await installTauri(page);
    await page.goto('/');
    await startPlayback(page, { positionS: 5 });
  });

  test('shows the plain lyrics, says they are not timed, and offers LRCLIB', async ({ page }) => {
    await openKaraoke(page);
    const karaoke = page.getByRole('region', { name: 'Karaoke' });
    await expect(karaoke.getByText('First plain line')).toBeVisible();
    await expect(karaoke.getByText('aren’t timed, so they can’t follow the music')).toBeVisible();
    await expect(
      karaoke.getByRole('button', { name: /Get timed lyrics from LRCLIB/u }),
    ).toBeVisible();
  });

  test('Escape closes karaoke but leaves Now Playing open', async ({ page }) => {
    await openKaraoke(page);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('region', { name: 'Karaoke' })).toBeHidden();
    await expect(page.getByRole('region', { name: 'Now playing' })).toBeVisible();
  });

  test('"Find a karaoke version" searches for it and leaves karaoke', async ({ page }) => {
    await openKaraoke(page);
    await page.getByRole('button', { name: 'Find a karaoke version' }).click();
    await expect(page.getByRole('region', { name: 'Karaoke' })).toBeHidden();
    await expect(page.getByRole('combobox')).toHaveValue('Test Song Test Artist karaoke');
  });
});

test.describe('with timed lyrics from LRCLIB', () => {
  test.beforeEach(async ({ page }) => {
    await installTauri(page, { lrclib: LRCLIB });
    await page.goto('/');
    await startPlayback(page, { positionS: 4, playing: false });
    await openKaraoke(page);
    await page
      .getByRole('region', { name: 'Karaoke' })
      .getByRole('button', { name: /Get timed lyrics from LRCLIB/u })
      .click();
  });

  test('counts down through the intro, then sings the line', async ({ page }) => {
    const karaoke = page.getByRole('region', { name: 'Karaoke' });
    // 4 s in: the first line is 6 s away, so the intro countdown shows with "Up next".
    await expect(karaoke.getByRole('img', { name: 'Instrumental' })).toBeVisible();
    await expect(karaoke.getByText('Up next')).toBeVisible();
    await expect(karaoke.getByText('Hello from the other side')).toBeVisible();

    await setPosition(page, 11, false);
    await expect(karaoke.getByRole('img', { name: 'Instrumental' })).toBeHidden();
    // The line being sung is split into words that fill one by one.
    await expect(karaoke.locator('p span span').filter({ hasText: 'Hello' }).first()).toBeVisible();
    await expect(karaoke.getByText('I must have called a thousand times')).toBeVisible();
  });

  test('counts down through a long instrumental break', async ({ page }) => {
    const karaoke = page.getByRole('region', { name: 'Karaoke' });
    await setPosition(page, 20, false); // line two ended at 18 s, line three starts at 30 s
    await expect(karaoke.getByRole('img', { name: 'Instrumental' })).toBeVisible();
    await expect(karaoke.getByText('To tell you I am sorry')).toBeVisible();
  });

  test('keyboard: space toggles playback and ] nudges the timing', async ({ page }) => {
    await setPosition(page, 11, false);
    await page.keyboard.press(' ');
    await page.keyboard.press(']');
    await page.keyboard.press('ArrowRight');
    const sent = await page.evaluate(
      () => (window as unknown as { __sent: { type: string; seconds?: number }[] }).__sent,
    );
    expect(sent.some((c) => c.type === 'toggle')).toBe(true);
    const seek = sent.find((c) => c.type === 'seek');
    expect(seek?.seconds).toBeGreaterThan(15);
  });
});

test('following the lyrics never slides the full-screen view sideways', async ({ page }) => {
  const lines = Array.from(
    { length: 24 },
    (_, i) =>
      `[${String(Math.floor((i * 4) / 60)).padStart(2, '0')}:${String((i * 4) % 60).padStart(2, '0')}.00] Line ${String(i + 1)} of the sample song`,
  ).join('\n');
  await installTauri(page, { lrclib: { plainLyrics: 'x', syncedLyrics: lines } });
  await page.goto('/');
  await startPlayback(page, {
    positionS: 30,
    track: { ...TRACK, artworkUrl: 'https://i.ytimg.com/vi/sample/hq720.jpg' },
  });
  await page.getByRole('button', { name: 'Open now playing' }).click();
  await page
    .getByRole('button', { name: /Get timed lyrics from LRCLIB/u })
    .first()
    .click();
  await expect(page.getByText('Line 8 of the sample song').first()).toBeVisible();
  await page.waitForTimeout(900);
  const scrolled = await page
    .getByRole('region', { name: /now playing/iu })
    .evaluate((el) => el.scrollLeft);
  expect(scrolled).toBe(0);
});
