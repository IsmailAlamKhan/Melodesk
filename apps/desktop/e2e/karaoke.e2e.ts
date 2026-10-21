import { expect, test, type Page } from '@playwright/test';
import { installTauri, setPosition, startPlayback } from './mock-tauri';

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
    await startPlayback(page, { positionS: 4 });
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

    await setPosition(page, 11, true);
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
    await setPosition(page, 11, true);
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
