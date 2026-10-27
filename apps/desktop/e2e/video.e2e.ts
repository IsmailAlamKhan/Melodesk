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

test('the video button asks the page for video, and is off for a song that has none', async ({
  page,
}) => {
  await installTauri(page);
  await page.goto('/');
  await startPlayback(page, { positionS: 2, track: TRACK });
  const footer = page.locator('footer');

  // A song with a video: the button works, and says what pressing it will do.
  await emit(page, flags({}));
  const button = footer.getByRole('button', { name: 'Switch to video' });
  await expect(button).toBeEnabled();
  await button.click();
  await expect
    .poll(async () =>
      (await sentCommands(page)).some((c) => c['type'] === 'setVideoMode' && c['video'] === true),
    )
    .toBe(true);

  // The page says it is showing the video: the button now takes you back to the song.
  await emit(page, flags({ isVideo: true }));
  await expect(footer.getByRole('button', { name: 'Switch to song' })).toBeEnabled();

  // A song the page says has no video: the button cannot be pressed, and says why.
  await emit(page, flags({ videoAvailable: false }));
  await expect(footer.getByRole('button', { name: 'This song has no video' })).toBeDisabled();
});
