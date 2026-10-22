import { expect, test } from '@playwright/test';
import { TRACK, emit, installTauri, sentCommands, startPlayback } from './mock-tauri';

test.beforeEach(async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await startPlayback(page, {
    positionS: 60,
    track: { ...TRACK, artworkUrl: 'https://i.ytimg.com/vi/sample/hq720.jpg' },
  });
});

const volumes = async (page: Parameters<typeof sentCommands>[0]): Promise<number[]> =>
  (await sentCommands(page)).flatMap((c) =>
    c['type'] === 'setVolume' ? [Number(c['volume'])] : [],
  );

test('the volume follows the drag, not only the release, and the thumb moves with it', async ({
  page,
}) => {
  const slider = page.locator('footer').getByRole('slider', { name: 'Volume' });
  const box = await page.locator('footer [data-slider-root]').last().boundingBox();
  if (!box) throw new Error('no volume slider');
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * 0.5, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, y, { steps: 8 });
  // Still held down: the thumb is already there and the player has been told.
  await expect(slider).toHaveAttribute('aria-valuenow', /0\.[789]/u);
  await expect.poll(async () => (await volumes(page)).length).toBeGreaterThan(0);
  await page.mouse.up();
  const sent = await volumes(page);
  expect(sent.at(-1)).toBeGreaterThan(0.7);
});

test('moving the volume while muted un-mutes', async ({ page }) => {
  await emit(page, {
    type: 'state',
    state: {
      playing: true,
      position: 60,
      duration: 200,
      volume: 0.5,
      muted: true,
      sampledAt: Date.now(),
    },
  });
  const box = await page.locator('footer [data-slider-root]').last().boundingBox();
  if (!box) throw new Error('no volume slider');
  await page.mouse.click(box.x + box.width * 0.6, box.y + box.height / 2);
  await expect
    .poll(async () =>
      (await sentCommands(page)).some((c) => c['type'] === 'setMuted' && c['muted'] === false),
    )
    .toBe(true);
});
