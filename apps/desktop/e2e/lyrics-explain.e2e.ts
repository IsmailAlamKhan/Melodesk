import { expect, test, type Page } from '@playwright/test';
import { TRACK, installTauri, startPlayback } from './mock-tauri';
import { openSettings } from './settings-nav';

const SYNCED =
  '[00:01.00] First found line\n[00:05.00] Second found line\n[00:09.00] Third found line';

const lrclib = (url: string) => {
  if (!url.includes('lrclib.net')) return null;
  return url.includes('/api/get')
    ? {
        status: 200,
        body: { trackName: 'x', artistName: 'y', duration: 300, syncedLyrics: SYNCED },
      }
    : { status: 200, body: [] };
};

async function enable(page: Page, ...plugins: string[]): Promise<void> {
  await openSettings(page, 'Plugins');
  for (const name of plugins) await page.getByRole('switch', { name: `Enable ${name}` }).check();
  await page.getByRole('link', { name: 'Home' }).first().click();
}

async function openLyrics(page: Page) {
  await startPlayback(page, {
    positionS: 2,
    track: { ...TRACK, artworkUrl: 'https://i.ytimg.com/vi/sample/hq720.jpg' },
  });
  await page.getByRole('button', { name: 'Open now playing' }).click();
  const view = page.getByRole('region', { name: /now playing/iu });
  await expect(view.getByText('Second found line')).toBeVisible();
  return view;
}

test('a lyric line can be explained by the local AI model', async ({ page }) => {
  await installTauri(page, {
    http: (url) => {
      if (url.includes('localhost:11434/api/tags'))
        return { status: 200, body: { models: [{ name: 'llama3.2:3b' }] } };
      if (url.includes('localhost:11434/api/generate'))
        return { status: 200, body: { response: 'It means the singer is waiting for a sign.' } };
      return lrclib(url);
    },
  });
  await page.goto('/');
  await enable(page, 'LRCLIB lyrics', 'Local AI song finder');
  const view = await openLyrics(page);
  await view.getByText('Second found line').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Explain this line' }).click();
  await expect(view.getByRole('note', { name: 'What this line means' })).toHaveText(
    'It means the singer is waiting for a sign.',
  );
});

test('explaining a line says how to turn it on when the AI helper is off', async ({ page }) => {
  await installTauri(page, { http: lrclib });
  await page.goto('/');
  await enable(page, 'LRCLIB lyrics');
  const view = await openLyrics(page);
  await view.getByText('Second found line').hover();
  await view.getByRole('button', { name: 'Line actions' }).first().click();
  await page.getByRole('menuitem', { name: 'Explain this line' }).click();
  await expect(view.getByRole('note')).toContainText('Local AI song finder');
});

test('a line, or a picture of it, can be copied', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await installTauri(page, { http: lrclib });
  await page.goto('/');
  await enable(page, 'LRCLIB lyrics');
  const view = await openLyrics(page);

  await view.getByText('Second found line').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy line' }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Second found line');

  await view.getByText('Third found line').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Copy as picture' }).click();
  await expect(page.getByText('Picture copied')).toBeVisible();
  const types = await page.evaluate(async () => {
    const items = await navigator.clipboard.read();
    return items.flatMap((i) => i.types);
  });
  expect(types).toContain('image/png');
});

test('an explanation keeps coming while the view is closed, and is kept afterwards', async ({
  page,
}) => {
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let asked = 0;
  await installTauri(page, {
    http: async (url) => {
      if (url.includes('localhost:11434/api/tags'))
        return { status: 200, body: { models: [{ name: 'llama3.2:3b' }] } };
      if (url.includes('localhost:11434/api/generate')) {
        asked += 1;
        await gate;
        return { status: 200, body: { response: 'A slow but thoughtful answer.' } };
      }
      return lrclib(url);
    },
  });
  await page.goto('/');
  await enable(page, 'LRCLIB lyrics', 'Local AI song finder');
  let view = await openLyrics(page);
  await view.getByText('Second found line').click({ button: 'right' });
  await page.getByRole('menuitem', { name: 'Explain this line' }).click();
  await expect(view.getByRole('note')).toHaveText('Thinking…');

  // Leave and come back while it is still thinking.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Open now playing' }).click();
  view = page.getByRole('region', { name: /now playing/iu });
  await expect(view.getByRole('note')).toHaveText('Thinking…');

  release();
  await expect(view.getByRole('note')).toHaveText('A slow but thoughtful answer.');
  await page.waitForTimeout(500);

  // Closed and reopened: the answer is there, and nobody is asked again.
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: 'Open now playing' }).click();
  await expect(view.getByRole('note')).toHaveText('A slow but thoughtful answer.');
  expect(asked).toBe(1);

  // And after a restart.
  await page.reload();
  await startPlayback(page, {
    positionS: 2,
    track: { ...TRACK, artworkUrl: 'https://i.ytimg.com/vi/sample/hq720.jpg' },
  });
  await page.getByRole('button', { name: 'Open now playing' }).click();
  await expect(view.getByRole('note')).toHaveText('A slow but thoughtful answer.');
  expect(asked).toBe(1);
});
