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
  await expect.poll(() => isStored(page, ART)).toBe(true);

  // Go offline: every image request now fails. A fresh load should still show the cover.
  await page.route(/^https:/u, (route) =>
    route.request().resourceType() === 'image'
      ? route.abort('internetdisconnected')
      : route.continue(),
  );
  await page.reload();
  await startPlayback(page, { track: { ...TRACK, artworkUrl: ART } });
  const offlineCover = page.locator('footer img').first();
  await expect
    .poll(async () => offlineCover.evaluate((img: HTMLImageElement) => img.currentSrc))
    .toMatch(/^blob:/u);
  expect(await offlineCover.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(
    0,
  );
});
