import { expect, test, type Page } from '@playwright/test';
import { TRACK, installTauri, startPlayback } from './mock-tauri';

const SYNCED =
  '[00:01.00] First found line\n[00:05.00] Second found line\n[00:09.00] Third found line';
const entry = (trackName: string, artistName: string) => ({
  trackName,
  artistName,
  duration: 300,
  syncedLyrics: SYNCED,
  plainLyrics: 'x',
});

async function enable(page: Page, ...plugins: string[]): Promise<void> {
  await page.getByRole('link', { name: 'Settings' }).click();
  for (const name of plugins) await page.getByRole('switch', { name: `Enable ${name}` }).check();
  await page.getByRole('link', { name: 'Home' }).first().click();
}

async function openLyrics(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Open now playing' }).click();
}

const cover = {
  ...TRACK,
  title: 'Zara Zara Bahekta Hai | RHTDM | Zendria',
  artist: 'ZENDRIA',
  artworkUrl: 'https://i.ytimg.com/vi/sample/hq720.jpg',
};

test('a cover is found under the song it covers, and the lyrics say how they were matched', async ({
  page,
}) => {
  await installTauri(page, {
    http: (url) => {
      if (!url.includes('lrclib.net')) return null;
      if (url.includes('/api/get')) return { status: 404, body: {} };
      // Only a search on the plain title finds the original.
      if (url.includes('q=Zara+Zara+Bahekta+Hai'))
        return { status: 200, body: [entry('Zara Zara Bahekta Hai', 'Bombay Jayashri')] };
      return { status: 200, body: [] };
    },
  });
  await page.goto('/');
  await enable(page, 'LRCLIB lyrics');
  await startPlayback(page, { positionS: 2, track: cover });
  await openLyrics(page);
  const view = page.getByRole('region', { name: /now playing/iu });
  await expect(view.getByText('First found line')).toBeVisible();
  await expect(view.getByText(/matched as “Zara Zara Bahekta Hai”/u)).toBeVisible();
});

test('when the title says nothing, a local AI model works out the song', async ({ page }) => {
  await installTauri(page, {
    http: (url) => {
      if (url.includes('localhost:11434/api/tags'))
        return { status: 200, body: { models: [{ name: 'llama3.2:3b' }] } };
      if (url.includes('localhost:11434/api/generate'))
        return {
          status: 200,
          body: {
            response: JSON.stringify({
              songs: [{ title: 'Original Song', artist: 'Real Artist' }],
            }),
          },
        };
      if (!url.includes('lrclib.net')) return null;
      if (url.includes('/api/get') && url.includes('Real+Artist'))
        return { status: 200, body: entry('Original Song', 'Real Artist') };
      return url.includes('/api/get') ? { status: 404, body: {} } : { status: 200, body: [] };
    },
  });
  await page.goto('/');
  await enable(page, 'LRCLIB lyrics', 'Local AI song finder');
  await startPlayback(page, {
    positionS: 2,
    track: {
      ...TRACK,
      title: 'my favourite tune ♥',
      artist: 'Some Kid',
      artworkUrl: cover.artworkUrl,
    },
  });
  await openLyrics(page);
  const view = page.getByRole('region', { name: /now playing/iu });
  await expect(view.getByText('First found line')).toBeVisible();
  await expect(view.getByText(/matched as “Original Song”/u)).toBeVisible();
});

test('without the AI helper, the listener can say which song it is', async ({ page }) => {
  await installTauri(page, {
    http: (url) => {
      if (!url.includes('lrclib.net')) return null;
      if (url.includes('/api/get') && url.includes('Typed+Song'))
        return { status: 200, body: entry('Typed Song', 'Typed Artist') };
      return url.includes('/api/get') ? { status: 404, body: {} } : { status: 200, body: [] };
    },
  });
  await page.goto('/');
  await enable(page, 'LRCLIB lyrics');
  await startPlayback(page, {
    positionS: 2,
    track: { ...TRACK, title: 'mystery upload', artist: 'Someone', artworkUrl: cover.artworkUrl },
  });
  await openLyrics(page);
  const view = page.getByRole('region', { name: /now playing/iu });
  await view.getByRole('button', { name: /Wrong or missing lyrics/u }).click();
  await view.getByLabel('Song title').fill('Typed Song');
  await view.getByLabel(/Original artist/u).fill('Typed Artist');
  await view.getByRole('button', { name: 'Find lyrics' }).click();
  await expect(view.getByText('First found line')).toBeVisible();
  await expect(view.getByText(/matched as “Typed Song”/u)).toBeVisible();
});

test('lyrics for an ordinary song are looked up exactly as before, with no extra guesses', async ({
  page,
}) => {
  const asked: string[] = [];
  await installTauri(page, {
    http: (url) => {
      if (!url.includes('lrclib.net')) return null;
      asked.push(url);
      return { status: 200, body: entry('Test Song', 'Test Artist') };
    },
  });
  await page.goto('/');
  await enable(page, 'LRCLIB lyrics');
  await startPlayback(page, { positionS: 2, track: { ...TRACK, artworkUrl: cover.artworkUrl } });
  await openLyrics(page);
  await expect(page.getByText('First found line')).toBeVisible();
  expect(asked).toHaveLength(1);
  expect(asked[0]).toContain('/api/get');
});
