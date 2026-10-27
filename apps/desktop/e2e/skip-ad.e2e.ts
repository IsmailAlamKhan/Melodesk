import { expect, test } from '@playwright/test';
import { emit, installTauri, sentCommands, startPlayback, TRACK } from './mock-tauri';

const flags = (over: Record<string, unknown>) => ({
  type: 'flags',
  flags: {
    likeStatus: null,
    playbackRate: 1,
    isVideo: false,
    adPlaying: false,
    adSkippable: false,
    videoAvailable: true,
    ...over,
  },
});

test('an ad that can be skipped offers Skip ad, and pressing it asks the page to press its own button', async ({
  page,
}) => {
  await installTauri(page);
  await page.goto('/');
  await startPlayback(page, { positionS: 2, track: TRACK });
  const player = page.locator('footer');
  await expect(player.getByText('Ad playing')).toHaveCount(0);

  // An ad with no Skip button yet: the button is there but cannot be pressed.
  await emit(page, flags({ adPlaying: true }));
  await expect(player.getByText('Ad playing')).toBeVisible();
  await expect(player.getByRole('button', { name: 'Skip ad' })).toBeDisabled();

  await emit(page, flags({ adPlaying: true, adSkippable: true }));
  const skip = player.getByRole('button', { name: 'Skip ad' });
  await expect(skip).toBeEnabled();
  await skip.click();
  await expect
    .poll(async () => (await sentCommands(page)).some((c) => c['type'] === 'skipAd'))
    .toBe(true);

  // The ad ends: nothing is left on screen.
  await emit(page, flags({}));
  await expect(player.getByText('Ad playing')).toHaveCount(0);
});
