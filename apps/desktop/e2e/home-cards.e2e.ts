import { expect, test, type Page } from '@playwright/test';
import { TRACK, emit, installTauri, sentCommands, setPosition, startPlayback } from './mock-tauri';

const ART = 'https://i.ytimg.com/vi/sample/hq720.jpg';

async function openHome(page: Page): Promise<void> {
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
}

test('new users see a few tips on Home, and dismissing them is remembered', async ({ page }) => {
  await installTauri(page);
  await openHome(page);
  const tips = page.getByRole('region', { name: 'Getting started' });
  await expect(tips).toBeVisible();
  await expect(tips.getByText('Command palette')).toBeVisible();
  await tips.getByRole('button', { name: 'Got it' }).click();
  await expect(tips).toHaveCount(0);
  await page.reload();
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await expect(page.getByRole('heading', { name: 'Indian Music' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Getting started' })).toHaveCount(0);
});

test('what you were listening to is saved when you pause, and offered next time', async ({
  page,
}) => {
  await installTauri(page);
  await openHome(page);
  await startPlayback(page, { positionS: 75, track: { ...TRACK, artworkUrl: ART } });
  await setPosition(page, 75, false);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('__mockKv') ?? ''))
    .toContain('resume:last');
  const saved = await page.evaluate(() => {
    const entries = JSON.parse(localStorage.getItem('__mockKv') ?? '[]') as [string, string][];
    return JSON.parse(entries.find(([k]) => k === 'resume:last')?.[1] ?? '{}') as {
      videoId: string;
      position: number;
    };
  });
  expect(saved.videoId).toBe(TRACK.videoId);
  expect(saved.position).toBeGreaterThanOrEqual(74);

  // A new session: nothing is playing, so the card is there.
  await page.reload();
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  const card = page.getByText('Continue listening').first();
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  expect((await sentCommands(page)).some((c) => c['type'] === 'endpoint')).toBe(true);
  // When the song has loaded, it is moved to where it was.
  await startPlayback(page, { positionS: 0, track: { ...TRACK, artworkUrl: ART } });
  await expect
    .poll(async () => (await sentCommands(page)).find((c) => c['type'] === 'seek'))
    .toMatchObject({ seconds: 75 });
  // Now something is playing, so the card steps aside.
  await expect(page.getByText('Continue listening')).toHaveCount(0);
});

test('a song that has only just started is not worth coming back to', async ({ page }) => {
  await installTauri(page);
  await openHome(page);
  await startPlayback(page, { positionS: 3, track: TRACK });
  await setPosition(page, 3, false);
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => localStorage.getItem('__mockKv') ?? '')).not.toContain(
    'resume:last',
  );
});

test('Continue plays the saved song even when its saved endpoint is for another one', async ({
  page,
}) => {
  const saved = {
    videoId: 'right-song',
    title: 'Right Song',
    artist: 'Someone',
    artworkUrl: null,
    position: 60,
    duration: 200,
    endpoint: { watchEndpoint: { videoId: 'wrong-song', playlistId: 'RDx' } },
    savedAt: Date.now(),
  };
  await page.addInitScript((value) => {
    localStorage.setItem('__mockKv', JSON.stringify([['resume:last', JSON.stringify(value)]]));
  }, saved);
  await installTauri(page);
  await openHome(page);
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect
    .poll(async () => (await sentCommands(page)).find((c) => c['type'] === 'endpoint'))
    .toMatchObject({ endpoint: { watchEndpoint: { videoId: 'right-song' } } });
});
