import { expect, test, type Page } from '@playwright/test';
import { installTauri, startPlayback, TRACK } from './mock-tauri';

const ART = 'https://i.ytimg.com/vi/offline-test/hq720.jpg';

/** Whether this exact cover has been written to the offline cache. */
async function isStored(page: Page, url: string): Promise<boolean> {
  return page.evaluate(
    (key) =>
      new Promise<boolean>((resolve) => {
        const open = indexedDB.open('melodesk-artwork', 1);
        open.onerror = () => {
          resolve(false);
        };
        open.onsuccess = () => {
          if (!open.result.objectStoreNames.contains('images')) {
            resolve(false);
            return;
          }
          const req = open.result.transaction('images').objectStore('images').count(key);
          req.onsuccess = () => {
            resolve(req.result > 0);
          };
        };
      }),
    url,
  );
}

test('covers are kept for offline use and shown when the network copy fails', async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await startPlayback(page, { track: { ...TRACK, artworkUrl: ART } });

  const cover = page.locator('footer img').first();
  await expect(cover).toBeVisible();
  // The cover is stored once it has loaded (the shelf covers are stored too, so wait for this one).
  await expect.poll(() => isStored(page, ART), { timeout: 20_000 }).toBe(true);

  // Go offline: every image request now fails. A fresh load should still show the cover.
  await page.route(/^https:/u, (route) =>
    route.request().resourceType() === 'image'
      ? route.abort('internetdisconnected')
      : route.fallback(),
  );
  await page.reload();
  await startPlayback(page, { track: { ...TRACK, artworkUrl: ART } });
  const offlineCover = page.locator('footer img').first();
  await expect
    .poll(async () => offlineCover.evaluate((img: HTMLImageElement) => img.currentSrc), {
      timeout: 20_000,
    })
    .toMatch(/^blob:/u);
  expect(await offlineCover.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(
    0,
  );
});

test('cover requests carry no Referer (Google rejects some, and it is nobody else’s business)', async ({
  page,
}) => {
  const referers: (string | undefined)[] = [];
  page.on('request', (req) => {
    if (/googleusercontent|ytimg|ggpht/u.test(req.url())) referers.push(req.headers()['referer']);
  });
  await installTauri(page);
  await page.goto('/');
  await startPlayback(page, { track: { ...TRACK, artworkUrl: ART } });
  await page
    .getByRole('link', { name: /Uncut Bollywood/u })
    .first()
    .click();
  await page.waitForTimeout(800);
  expect(referers.length).toBeGreaterThan(0);
  expect(referers.filter(Boolean)).toEqual([]);
});

test('covers from hosts without CORS headers (gstatic, music.youtube.com) still show', async ({
  page,
}) => {
  await installTauri(page);
  // Like Google's real answer for these hosts: an image, and no Access-Control-Allow-Origin.
  await page.route(/^https:\/\/(www\.gstatic\.com|music\.youtube\.com)\/.*\.png/u, (route) =>
    route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><rect width="64" height="64" fill="#a33"/></svg>',
    }),
  );
  await page.goto('/');
  await startPlayback(page, {
    track: { ...TRACK, artworkUrl: 'https://www.gstatic.com/music/listening_review/X_226x226.png' },
  });
  const cover = page.locator('footer img').first();
  await expect(cover).toBeVisible();
  await expect
    .poll(() => cover.evaluate((img: HTMLImageElement) => img.naturalWidth))
    .toBeGreaterThan(0);
  // And the same cover from a host that does allow CORS is requested in CORS mode (shared download).
  expect(await cover.evaluate((img: HTMLImageElement) => img.crossOrigin)).toBeNull();
});
