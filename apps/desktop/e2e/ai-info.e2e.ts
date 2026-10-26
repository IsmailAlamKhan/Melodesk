import { expect, test, type Page } from '@playwright/test';
import { TRACK, emit, installTauri, startPlayback, type LocalFixture } from './mock-tauri';
import { openSettings } from './settings-nav';

const MB = (url: string) => {
  if (!url.includes('musicbrainz.org')) return null;
  if (url.includes('/ws/2/recording?'))
    return {
      status: 200,
      body: {
        recordings: [
          {
            id: 'rec1',
            title: TRACK.title,
            score: 100,
            'artist-credit': [{ artist: { id: 'art1', name: 'Test Artist' } }],
            releases: [{ title: 'First Album', date: '1999-05-01' }],
            tags: [{ name: 'dream pop', count: 4 }],
          },
        ],
      },
    };
  if (url.includes('/ws/2/artist/art1'))
    return {
      status: 200,
      body: { country: 'GB', type: 'Group', 'life-span': { begin: '1995' }, genres: [] },
    };
  if (url.includes('/ws/2/artist?'))
    return { status: 200, body: { artists: [{ id: 'art1', name: 'Test Artist', score: 100 }] } };
  if (url.includes('/ws/2/release-group?')) {
    const d = new Date(Date.now() - 10 * 86_400_000).toISOString().slice(0, 10);
    return {
      status: 200,
      body: {
        'release-groups': [
          { id: 'g1', title: 'Fresh Record', 'primary-type': 'Album', 'first-release-date': d },
        ],
      },
    };
  }
  return { status: 200, body: {} };
};

async function enable(page: Page, ...plugins: string[]): Promise<void> {
  await openSettings(page, 'Plugins');
  for (const name of plugins) await page.getByRole('switch', { name: `Enable ${name}` }).check();
  await page.getByRole('link', { name: 'Home' }).first().click();
}

test('song info asks before anything is sent, then shows facts about the song and artist', async ({
  page,
}) => {
  const asked: string[] = [];
  await installTauri(page, {
    http: (url) => {
      asked.push(url);
      return MB(url);
    },
  });
  await page.goto('/');
  await startPlayback(page, { positionS: 2, track: TRACK });
  await page.getByRole('button', { name: 'Open now playing' }).click();
  const view = page.getByRole('region', { name: /now playing/iu });
  await view.getByRole('tab', { name: 'Song info' }).click();
  await expect(view.getByText(/open music database/u)).toBeVisible();
  expect(asked.filter((u) => u.includes('musicbrainz'))).toHaveLength(0);
  await view.getByRole('button', { name: 'Turn on MusicBrainz' }).click();
  await expect(view.getByText('1999-05-01')).toBeVisible({ timeout: 15_000 });
  await expect(view.getByText('First Album')).toBeVisible();
  await expect(view.getByText('GB')).toBeVisible();
  await expect(view.getByText('1995 – present')).toBeVisible();
});

test('the release radar offers itself on Home, then lists new releases from top artists', async ({
  page,
}) => {
  await installTauri(page, {
    http: MB,
    sql: (query) => (query.includes('FROM history') ? [{ name: 'Test Artist' }] : []),
  });
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await expect(page.getByText(/top artists’ names/u)).toBeVisible();
  await page.getByRole('button', { name: 'Turn on MusicBrainz' }).click();
  await expect(page.getByRole('button', { name: /Fresh Record/u })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('New from artists you play')).toBeVisible();
});

const FILES: LocalFixture[] = [
  { path: '/music/a.mp3', title: 'Brook Song', artist: 'Brook', album: 'B', durationMs: 100_000 },
  { path: '/music/b.mp3', title: 'Other Song', artist: 'Cedar', album: 'C', durationMs: 100_000 },
];

test('a smart playlist can be filled in from a description by the local AI model', async ({
  page,
}) => {
  const prompts: string[] = [];
  await installTauri(page, {
    local: { files: FILES, pickFolder: '/music', art: [], clipSeconds: 30 },
    http: (url) => {
      if (url.includes('localhost:11434/api/tags'))
        return { status: 200, body: { models: [{ name: 'llama3.2:3b' }] } };
      if (url.includes('localhost:11434/api/generate')) {
        prompts.push(url);
        return {
          status: 200,
          body: { response: '{"text":"brook","sort":"title","extra":"ignored"}' },
        };
      }
      return null;
    },
  });
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  // Without the model there is no way to describe a playlist.
  await page.getByRole('link', { name: 'Local music' }).first().click();
  await page.getByRole('button', { name: 'Add a folder' }).click();
  await expect(page.getByRole('row').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Playlists' }).click();
  await page.getByRole('button', { name: 'New smart playlist' }).click();
  await expect(page.getByLabel('Describe it in words')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel' }).click();

  await enable(page, 'Local AI song finder');
  await page.getByRole('link', { name: 'Local music' }).first().click();
  await page.getByRole('tab', { name: 'Playlists' }).click();
  await page.getByRole('button', { name: 'New smart playlist' }).click();
  const dialog = page.getByRole('dialog', { name: 'New smart playlist' });
  await dialog.getByLabel('Describe it in words').fill('anything by brook');
  await dialog.getByRole('button', { name: 'Fill in the rules' }).click();
  await expect(dialog.getByLabel('Title, artist, album or genre contains')).toHaveValue('brook');
  await expect(dialog.getByText('1 songs match right now')).toBeVisible();
  expect(prompts).toHaveLength(1);
});
