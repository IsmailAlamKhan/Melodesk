import { expect, test, type Page } from '@playwright/test';
import { emit, installTauri, sentCommands } from './mock-tauri';

const SONGS = [
  {
    id: 's1',
    title: 'Remote One',
    artist: 'Remote Band',
    album: 'Server Album',
    duration: 200,
    track: 1,
    contentType: 'audio/wav',
    coverArt: 'al1',
  },
  {
    id: 's2',
    title: 'Remote Two',
    artist: 'Remote Band',
    album: 'Server Album',
    duration: 210,
    track: 2,
    contentType: 'audio/wav',
    coverArt: 'al1',
  },
];

const server = {
  methods: {
    ping: {},
    getAlbumList2: {
      albumList2: {
        album: [
          {
            id: 'al1',
            name: 'Server Album',
            artist: 'Remote Band',
            artistId: 'ar1',
            songCount: 2,
            year: 2019,
            coverArt: 'al1',
          },
        ],
      },
    },
    getAlbum: { album: { id: 'al1', name: 'Server Album', artist: 'Remote Band', song: SONGS } },
    getArtists: {
      artists: {
        index: [{ name: 'R', artist: [{ id: 'ar1', name: 'Remote Band', albumCount: 1 }] }],
      },
    },
    getPlaylists: { playlists: { playlist: [{ id: 'p1', name: 'Road trip', songCount: 2 }] } },
    getPlaylist: { playlist: { id: 'p1', name: 'Road trip', entry: SONGS } },
    search3: { searchResult3: { song: [SONGS[0]], album: [], artist: [] } },
  },
};

test.beforeEach(async ({ page }) => {
  await installTauri(page, { server, local: { files: [], clipSeconds: 20 } });
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await page.getByRole('link', { name: 'Server', exact: true }).first().click();
});

async function connect(page: Page): Promise<void> {
  await page.getByLabel('Server address').fill('https://music.example.com/');
  await page.getByLabel('User name').fill('ann');
  await page.getByLabel('Password').fill('sesame');
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByRole('link', { name: /Server Album/u })).toBeVisible();
}

test('a server is connected with a signed login, and its albums play', async ({ page }) => {
  await connect(page);
  // The host was allowed before anything was fetched, and the password never went over the wire.
  const sent = await sentCommands(page);
  expect(
    sent.some(
      (c) => c['type'] === 'net_allow' && (c['hosts'] as string[]).includes('music.example.com'),
    ),
  ).toBe(true);
  const asked = sent.filter((c) => c['type'] === 'net_text').map((c) => String(c['url']));
  expect(asked.every((u) => u.startsWith('https://music.example.com/rest/'))).toBe(true);

  await page.getByRole('link', { name: /Server Album/u }).click();
  await expect(page.getByRole('heading', { name: 'Server Album' })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(2);
  await page.getByRole('row').filter({ hasText: 'Remote Two' }).click();
  await expect(page.locator('footer').getByText('Remote Two')).toBeVisible();
  await expect(page.locator('footer').getByRole('button', { name: 'Pause' })).toBeVisible();
  // The song was fetched from the server, by its id.
  expect(
    (await sentCommands(page)).filter((c) => c['type'] === 'net_bytes' && c['id'] === 's2'),
  ).toHaveLength(1);
});

test('wrong details are explained and nothing is kept', async ({ page }) => {
  await page.getByLabel('Server address').fill('https://music.example.com');
  await page.getByLabel('User name').fill('ann');
  await page.getByLabel('Password').fill('wrong');
  // This server answers every login with an error.
  await page.evaluate(() => {
    (
      window as unknown as { __serverMock: { methods: Record<string, unknown> } }
    ).__serverMock.methods = {};
  });
  await page.getByRole('button', { name: 'Connect' }).click();
  await expect(page.getByRole('alert')).toContainText('Wrong username or password');
  await expect(page.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
});

test('playlists and search list songs that play', async ({ page }) => {
  await connect(page);
  await page.getByRole('tab', { name: 'Playlists' }).click();
  await page.getByRole('link', { name: /Road trip/u }).click();
  await expect(page.getByRole('row')).toHaveCount(2);
  await page.getByRole('link', { name: 'Server', exact: true }).first().click();
  await page.getByRole('tab', { name: 'Search' }).click();
  await page.getByRole('searchbox', { name: 'Search the server' }).fill('remote');
  await expect(page.getByRole('row').filter({ hasText: 'Remote One' })).toBeVisible();
});
