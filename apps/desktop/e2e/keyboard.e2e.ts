import { expect, test, type Page } from '@playwright/test';
import { TRACK, emit, installTauri, sentCommands, startPlayback } from './mock-tauri';
import { openSettings } from './settings-nav';

test.beforeEach(async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await startPlayback(page, {
    positionS: 60,
    playing: false,
    track: { ...TRACK, artworkUrl: 'https://i.ytimg.com/vi/sample/hq720.jpg' },
  });
  await emit(page, {
    type: 'queue',
    queue: { index: 0, shuffle: false, repeat: 'off', autoplay: true, title: 'Mix', items: [] },
  });
});

const types = async (page: Page): Promise<string[]> =>
  (await sentCommands(page)).map((c) => String(c['type']));

test('keys control playback from anywhere in the app', async ({ page }) => {
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('m');
  await page.keyboard.press('s');
  await page.keyboard.press('r');
  await page.keyboard.press('n');
  await page.keyboard.press('p');
  const sent = await sentCommands(page);
  expect(sent).toContainEqual({ type: 'toggle' });
  expect(sent).toContainEqual({ type: 'seek', seconds: 65 });
  expect(sent).toContainEqual({ type: 'setVolume', volume: 0.55 });
  expect(sent).toContainEqual({ type: 'setMuted', muted: true });
  expect(sent).toContainEqual({ type: 'setShuffle', enabled: true });
  expect(sent).toContainEqual({ type: 'setRepeat', mode: 'all' });
  expect(await types(page)).toEqual(expect.arrayContaining(['next', 'previous']));
});

test('typing, sliders and buttons keep their keys', async ({ page }) => {
  const before = (await sentCommands(page)).length;
  await page.getByRole('combobox', { name: /Search/u }).click();
  await page.keyboard.type('a song s n p m');
  await page.keyboard.press('Escape');
  // A focused button is pressed by Space, not stolen from.
  await page.getByRole('button', { name: 'Queue' }).first().focus();
  await page.keyboard.press('Space');
  const sent = (await sentCommands(page)).slice(before);
  expect(sent.map((c) => c['type'])).not.toContain('toggle');
  expect(sent.map((c) => c['type'])).not.toContain('next');
  expect(sent.map((c) => c['type'])).not.toContain('setMuted');
});

test('? shows the list of keys, Escape closes it', async ({ page }) => {
  await page.keyboard.press('?');
  const sheet = page.getByRole('dialog', { name: 'Keyboard shortcuts' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Play or pause')).toBeVisible();
  await expect(sheet.getByText('Command palette')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(sheet).toHaveCount(0);
});

test('in Now Playing Space still plays and pauses exactly once', async ({ page }) => {
  await page.getByRole('button', { name: 'Open now playing' }).click();
  const before = (await types(page)).filter((x) => x === 'toggle').length;
  await page.keyboard.press('Space');
  await page.waitForTimeout(200);
  expect((await types(page)).filter((x) => x === 'toggle').length - before).toBe(1);
});

test('the keys go away with the feature', async ({ page }) => {
  await openSettings(page, 'Features');
  await page.getByRole('switch', { name: /^Keyboard shortcuts [A-Z]/u }).uncheck();
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Home' })
    .click();
  await page.locator('body').click({ position: { x: 5, y: 5 } });
  const before = (await types(page)).filter((x) => x === 'toggle').length;
  await page.keyboard.press('Space');
  await page.keyboard.press('?');
  await page.waitForTimeout(200);
  expect((await types(page)).filter((x) => x === 'toggle').length).toBe(before);
  await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toHaveCount(0);
});
