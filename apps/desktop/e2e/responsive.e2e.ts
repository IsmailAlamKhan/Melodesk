import { expect, test, type Page } from '@playwright/test';
import { TRACK, emit, installTauri, sentCommands, startPlayback } from './mock-tauri';

test.use({ viewport: { width: 375, height: 812 } });

const WITH_ART = { ...TRACK, artworkUrl: 'https://i.ytimg.com/vi/sample/hq720.jpg' };

test.beforeEach(async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
});

/**
 * Elements that stick out of the window, ignoring what is clipped or scrolls sideways on purpose
 * (shelves, blurred backgrounds). The page's own scroll area and the body do not count as clipping.
 */
async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const out: string[] = [];
    for (const el of document.querySelectorAll('body *')) {
      const box = el.getBoundingClientRect();
      if (box.width === 0 || box.height === 0 || box.right <= width + 1) continue;
      let clipped = false;
      for (
        let p = el.parentElement;
        p && p !== document.body && p.tagName !== 'MAIN';
        p = p.parentElement
      ) {
        const x = getComputedStyle(p).overflowX;
        if (x !== 'visible' || getComputedStyle(p).display === 'none') {
          clipped = true;
          break;
        }
      }
      if (!clipped) {
        const label = el.getAttribute('aria-label') ?? el.textContent;
        out.push(
          `${el.tagName.toLowerCase()} "${label.slice(0, 30)}" ends at ${String(Math.round(box.right))}px`,
        );
      }
    }
    const main = document.querySelector('main');
    if (main && main.scrollWidth > main.clientWidth + 1) out.push('main scrolls sideways');
    return out;
  });
}

test('a tab bar replaces the sidebar and navigates', async ({ page }) => {
  const tabs = page.getByRole('navigation', { name: 'Primary' });
  await expect(tabs).toBeVisible();
  for (const name of ['Home', 'Explore', 'Library', 'Stats', 'Settings'])
    await expect(tabs.getByRole('link', { name })).toBeVisible();
  await tabs.getByRole('link', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await tabs.getByRole('link', { name: 'Home' }).click();
  await expect(page.getByRole('heading', { name: 'Indian Music' })).toBeVisible();
});

test('every top-bar control fits, including the panel buttons', async ({ page }) => {
  for (const name of ['Back', 'Queue', 'Lyrics'])
    await expect(page.getByRole('button', { name })).toBeInViewport({ ratio: 1 });
  await expect(page.getByRole('combobox')).toBeInViewport({ ratio: 1 });
});

test('pages fit the window width', async ({ page }) => {
  const tabs = page.getByRole('navigation', { name: 'Primary' });
  for (const name of ['Home', 'Explore', 'Library', 'Stats', 'Settings']) {
    await tabs.getByRole('link', { name }).click();
    await page.waitForTimeout(300);
    expect(await overflowing(page), name).toEqual([]);
  }
  const box = page.getByRole('combobox', { name: /Search/u });
  await box.fill('daft punk');
  await box.press('Enter');
  await expect(page.getByText('Instant Crush (feat. Julian Casablancas)').first()).toBeVisible();
  expect(await overflowing(page), 'search').toEqual([]);
});

test('the player bar is compact: transport only, and tapping the cover opens Now Playing', async ({
  page,
}) => {
  await startPlayback(page, { positionS: 12, track: WITH_ART });
  const bar = page.getByRole('contentinfo', { name: /player/iu });
  await expect(bar.getByRole('button', { name: 'Pause' })).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Next' })).toBeVisible();
  await expect(bar.getByRole('slider', { name: 'Volume' })).toBeHidden();
  await expect(bar.getByRole('button', { name: /Shuffle/u })).toBeHidden();
  expect(await overflowing(page)).toEqual([]);
  await bar.getByRole('button', { name: 'Open now playing' }).click();
  await expect(
    page.getByRole('dialog', { name: /now playing/iu }).or(page.getByText('Test Song').nth(1)),
  ).toBeVisible();
  expect(await overflowing(page), 'now playing').toEqual([]);
});

test('a panel opens full screen and can be closed', async ({ page }) => {
  await startPlayback(page, { track: WITH_ART });
  await page.getByRole('button', { name: 'Queue' }).first().click();
  const panel = page.getByRole('complementary', { name: 'Queue' });
  await expect(panel).toBeVisible();
  const box = await panel.boundingBox();
  expect(box?.width).toBe(375);
  expect(box?.height).toBe(812);
  await panel.getByRole('button', { name: 'Close' }).click();
  await expect(panel).toBeHidden();
});

test('one tap plays a song in a list', async ({ page }) => {
  await startPlayback(page);
  await emit(page, {
    type: 'queue',
    queue: {
      index: 0,
      shuffle: false,
      repeat: 'off',
      autoplay: true,
      title: 'Test mix',
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
  await page.getByRole('button', { name: 'Queue' }).first().click();
  await page.getByText('Two').click();
  expect(await sentCommands(page)).toContainEqual({ type: 'queueSelect', index: 1 });
});

test('a playlist page fits and lists tracks in one column set', async ({ page }) => {
  await page
    .getByRole('link', { name: /Uncut Bollywood/u })
    .first()
    .click();
  await expect(page.getByRole('row').first()).toBeVisible();
  await page.waitForTimeout(400);
  await page.screenshot({
    path: '/private/tmp/claude-501/-Volumes-OtherStuff-Development-personal-projects-yt-desktop/5cd0deb8-b1b3-4153-b686-f6ec330ada20/scratchpad/m-detail.png',
  });
  expect(await overflowing(page), 'playlist').toEqual([]);
});

test('tapping the player card opens Now Playing, and queue rows can be reordered by touch', async ({
  page,
}) => {
  await startPlayback(page, { track: WITH_ART });
  await emit(page, {
    type: 'queue',
    queue: {
      index: 0,
      shuffle: false,
      repeat: 'off',
      autoplay: true,
      title: 'Test mix',
      items: ['One', 'Two'].map((title, i) => ({
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
  await page.getByRole('button', { name: 'Queue' }).first().click();
  // No hovering on a phone: the drag handle and the remove button are always there.
  await expect(page.getByRole('button', { name: 'Drag to reorder' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove from queue' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await page.getByRole('contentinfo').getByText('Test Song').click();
  await expect(page.getByRole('region', { name: /now playing/iu })).toBeVisible();
});

test.describe('in between: a navigation rail', () => {
  test.use({ viewport: { width: 700, height: 800 } });

  test('shows the rail with labels instead of the tab bar, and pages still fit', async ({
    page,
  }) => {
    const rail = page.getByRole('navigation', { name: 'Primary' });
    await expect(rail).toBeVisible();
    await expect(rail.getByRole('link', { name: 'Library' })).toBeVisible();
    const box = await rail.boundingBox();
    expect(box?.width).toBe(80);
    expect(box?.x).toBe(0);
    for (const name of ['Home', 'Explore', 'Library', 'Stats', 'Settings']) {
      await rail.getByRole('link', { name }).click();
      await page.waitForTimeout(300);
      expect(await overflowing(page), name).toEqual([]);
    }
  });
});
