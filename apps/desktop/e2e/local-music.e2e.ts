import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { emit, installTauri, sentCommands, type LocalFixture } from './mock-tauri';

const FILES: LocalFixture[] = [
  {
    path: '/music/Alpha/01 First.mp3',
    title: 'First Light',
    artist: 'Aurora Band',
    album: 'Alpha',
    trackNo: 1,
    year: 2020,
    durationMs: 180_000,
  },
  {
    path: '/music/Alpha/02 Second.mp3',
    title: 'Second Wind',
    artist: 'Aurora Band',
    album: 'Alpha',
    trackNo: 2,
    year: 2020,
    durationMs: 200_000,
  },
  {
    path: '/music/Alpha/03 Third.mp3',
    title: 'Third Rail',
    artist: 'Aurora Band',
    album: 'Alpha',
    trackNo: 3,
    year: 2020,
    durationMs: 220_000,
  },
  {
    path: '/music/Beta/01 Solo.flac',
    title: 'Solo Walk',
    artist: 'Brook',
    album: 'Beta',
    trackNo: 1,
    year: 2021,
    durationMs: 150_000,
  },
  {
    path: '/music/loose.wav',
    title: 'Loose End',
    artist: 'Cedar',
    album: null,
    durationMs: 90_000,
  },
];

async function open(
  page: Page,
  opts: { folders?: boolean; clip?: number; sidecars?: Record<string, string> } = {},
) {
  await installTauri(page, {
    local: {
      files: FILES,
      pickFolder: '/music',
      art: ['/music/Alpha/01 First.mp3'],
      clipSeconds: opts.clip ?? 30,
      ...(opts.sidecars ? { sidecars: opts.sidecars } : {}),
    },
  });
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await page.getByRole('link', { name: 'Local music' }).first().click();
}

async function addMusicFolder(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add a folder' }).click();
  await expect(page.getByRole('row').first()).toBeVisible();
}

const row = (page: Page, title: string) => page.getByRole('row').filter({ hasText: title });
const footer = (page: Page) => page.locator('footer');

test('an empty library invites you to add a folder, and lists what is in it', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { name: 'No music here yet' })).toBeVisible();
  await addMusicFolder(page);
  await expect(page.getByRole('status').first()).toHaveText('5 songs');
  // By artist, then album, then track.
  const titles = await page.getByRole('row').locator('div.truncate.text-sm').allTextContents();
  expect(titles).toEqual(['First Light', 'Second Wind', 'Third Rail', 'Solo Walk', 'Loose End']);
});

test('a song plays in the same player bar, and the web player is put to rest', async ({ page }) => {
  await open(page);
  await addMusicFolder(page);
  await row(page, 'Second Wind').click();
  await expect(footer(page).getByText('Second Wind')).toBeVisible();
  await expect(footer(page).getByRole('button', { name: 'Pause' })).toBeVisible();
  const sent = await sentCommands(page);
  expect(sent).toContainEqual({ type: 'pause' });
  expect(sent).toContainEqual({ type: 'local_set_active', active: true });
  // Time moves on: the bar is following the real audio.
  await expect(footer(page).getByText('0:02')).toBeVisible({ timeout: 6000 });
  // Pause and play are for the local player, not sent to YouTube.
  await footer(page).getByRole('button', { name: 'Pause' }).click();
  await expect(footer(page).getByRole('button', { name: 'Play', exact: true })).toBeVisible();
  expect((await sentCommands(page)).filter((c) => c['type'] === 'toggle')).toEqual([]);
});

test('next, previous and the queue follow the list the song was played from', async ({ page }) => {
  await open(page);
  await addMusicFolder(page);
  await row(page, 'First Light').click();
  await expect(footer(page).getByText('First Light')).toBeVisible();
  await footer(page).getByRole('button', { name: 'Next' }).click();
  await expect(footer(page).getByText('Second Wind')).toBeVisible();
  await footer(page).getByRole('button', { name: 'Next' }).click();
  await expect(footer(page).getByText('Third Rail')).toBeVisible();
  await footer(page).getByRole('button', { name: 'Previous' }).click();
  await expect(footer(page).getByText('Second Wind')).toBeVisible();
});

test('when a song ends the next one starts', async ({ page }) => {
  await open(page, { clip: 2 });
  await addMusicFolder(page);
  await row(page, 'First Light').click();
  await expect(footer(page).getByText('First Light')).toBeVisible();
  await expect(footer(page).getByText('Second Wind')).toBeVisible({ timeout: 8000 });
});

test('albums open to their songs in track order, and play from the top', async ({ page }) => {
  await open(page);
  await addMusicFolder(page);
  await page.getByRole('tab', { name: 'Albums' }).click();
  await page.getByRole('link', { name: /Alpha/u }).click();
  await expect(page.getByRole('heading', { name: 'Alpha' })).toBeVisible();
  await expect(page.getByText('Aurora Band · 3 songs · 10 min')).toBeVisible();
  await page.getByRole('main').getByRole('button', { name: 'Play', exact: true }).click();
  await expect(footer(page).getByText('First Light')).toBeVisible();
});

test('searching narrows the songs', async ({ page }) => {
  await open(page);
  await addMusicFolder(page);
  await page.getByRole('searchbox', { name: 'Search your music' }).fill('brook');
  await expect(page.getByRole('row')).toHaveCount(1);
  await expect(row(page, 'Solo Walk')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Search your music' }).fill('zzz');
  await expect(page.getByText('Nothing matches “zzz”.')).toBeVisible();
});

test('starting something on YouTube stops the local song', async ({ page }) => {
  await open(page);
  await addMusicFolder(page);
  await row(page, 'First Light').click();
  await expect(footer(page).getByText('First Light')).toBeVisible();
  await page.getByRole('link', { name: 'Home' }).first().click();
  await page
    .getByRole('button', { name: /^Play / })
    .first()
    .click({ force: true });
  await expect
    .poll(async () =>
      (await sentCommands(page)).some(
        (c) => c['type'] === 'local_set_active' && c['active'] === false,
      ),
    )
    .toBe(true);
  expect((await sentCommands(page)).some((c) => c['type'] === 'endpoint')).toBe(true);
});

test('lyrics saved beside a song are shown for it', async ({ page }) => {
  await open(page, {
    sidecars: {
      '/music/Alpha/01 First.mp3':
        '[00:01.00] Sidecar line one\n[00:04.00] Sidecar line two\n[00:08.00] Sidecar line three',
    },
  });
  await addMusicFolder(page);
  await row(page, 'First Light').click();
  await page.getByRole('button', { name: 'Open now playing' }).click();
  await expect(page.getByText('Sidecar line two')).toBeVisible();
});

test('the local music pages have no accessibility violations', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('heading', { name: 'No music here yet' })).toBeVisible();
  const scan = async (name: string): Promise<string[]> => {
    await page.waitForTimeout(400);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    return result.violations.map(
      (v) => `${name}: ${v.id} ×${String(v.nodes.length)} ${v.nodes[0]?.target.join(' ') ?? ''}`,
    );
  };
  const found = await scan('empty');
  await addMusicFolder(page);
  await row(page, 'First Light').click();
  found.push(...(await scan('songs, playing')));
  await page.getByRole('tab', { name: 'Albums' }).click();
  found.push(...(await scan('albums')));
  await page.getByRole('link', { name: /Alpha/u }).click();
  await expect(page.getByRole('heading', { name: 'Alpha' })).toBeVisible();
  found.push(...(await scan('album')));
  expect(found).toEqual([]);
});
