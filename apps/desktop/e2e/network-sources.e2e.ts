import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { emit, installTauri, sentCommands } from './mock-tauri';

const FEED = `<?xml version="1.0"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
<title>The Test Cast</title><itunes:author>Host</itunes:author>
<itunes:image href="https://img.example.com/cast.jpg"/>
<item><title>Pilot</title><guid>g1</guid><enclosure url="https://tracker.example.com/pilot.wav" type="audio/wav"/><itunes:duration>0:45</itunes:duration></item>
<item><title>Second</title><guid>g2</guid><enclosure url="https://tracker.example.com/second.wav" type="audio/wav"/><itunes:duration>1:10</itunes:duration></item>
</channel></rss>`;

const web = {
  'https://feeds.example.com/cast.xml': FEED,
  'https://itunes.apple.com/search': JSON.stringify({
    results: [
      {
        collectionName: 'Found Cast',
        artistName: 'Someone',
        feedUrl: 'https://feeds.example.com/cast.xml',
      },
    ],
  }),
  'https://de1.api.radio-browser.info/json/stations/search': JSON.stringify([
    {
      name: 'Jazz FM',
      url_resolved: 'https://stream.example.com/jazz',
      country: 'UK',
      codec: 'MP3',
      bitrate: 128,
    },
  ]),
  'https://stream.example.com/list.pls': '[playlist]\nFile1=https://stream.example.com/live-one\n',
};

async function start(page: Page, link: string): Promise<void> {
  await installTauri(page, { web, local: { files: [], clipSeconds: 20 } });
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await page.getByRole('link', { name: link, exact: true }).first().click();
}

test('a podcast is followed by its feed and its episodes play and are remembered', async ({
  page,
}) => {
  await start(page, 'Podcasts');
  await page
    .getByLabel('Search for a podcast, or paste its feed address')
    .fill('https://feeds.example.com/cast.xml');
  await page.getByRole('button', { name: 'Follow' }).click();
  await page.getByRole('link', { name: /The Test Cast/u }).click();
  await expect(page.getByRole('heading', { name: 'The Test Cast' })).toBeVisible();
  await expect(page.getByRole('row')).toHaveCount(2);
  await page.getByRole('row').filter({ hasText: 'Second' }).click();
  await expect(page.locator('footer').getByText('Second')).toBeVisible();
  await expect(page.locator('footer').getByRole('button', { name: 'Pause' })).toBeVisible();
  const fetched = (await sentCommands(page)).filter(
    (c) => c['type'] === 'net_bytes' && String(c['url']).endsWith('/second.wav'),
  );
  // Episodes come through trackers, so redirects to other public hosts are allowed for them.
  expect(fetched).toMatchObject([{ openRedirects: true }]);
});

test('a podcast can be found in the directory', async ({ page }) => {
  await start(page, 'Podcasts');
  await page.getByLabel('Search for a podcast, or paste its feed address').fill('test');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('Found Cast')).toBeVisible();
  await page.getByRole('button', { name: 'Follow' }).click();
  await expect(page.getByRole('link', { name: /The Test Cast/u })).toBeVisible();
});

test('a station is added from a playlist file and played through the relay', async ({ page }) => {
  await start(page, 'Radio');
  await page.getByLabel('Name', { exact: true }).fill('Live One');
  await page.getByLabel('Stream address').fill('https://stream.example.com/list.pls');
  await page.getByRole('button', { name: 'Add', exact: true }).click();
  await expect(page.getByText('https://stream.example.com/live-one')).toBeVisible();
  await page.getByRole('button', { name: 'Play Live One' }).click();
  await expect(page.locator('footer').getByText('Live One')).toBeVisible();
  await expect
    .poll(async () => (await sentCommands(page)).find((c) => c['type'] === 'radio_open'))
    .toMatchObject({ url: 'https://stream.example.com/live-one' });
});

test('stations are found in the directory and added', async ({ page }) => {
  await start(page, 'Radio');
  await page.getByLabel('Search stations by name').fill('jazz');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(page.getByText('MP3 · 128 kbps', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Add', exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Play Jazz FM' })).toBeVisible();
});

test('the podcast, radio and server pages have no accessibility violations', async ({ page }) => {
  await installTauri(page, { web, local: { files: [], clipSeconds: 20 } });
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  const found: string[] = [];
  for (const link of ['Podcasts', 'Radio', 'Server']) {
    await page.getByRole('link', { name: link, exact: true }).first().click();
    await page.waitForTimeout(500);
    const result = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
      .analyze();
    for (const v of result.violations)
      found.push(
        `${link}: ${v.id} ×${String(v.nodes.length)} ${v.nodes[0]?.target.join(' ') ?? ''}`,
      );
  }
  expect(found).toEqual([]);
});
