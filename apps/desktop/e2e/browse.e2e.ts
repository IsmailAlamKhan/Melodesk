import { expect, test } from '@playwright/test';
import { emit, installTauri, startPlayback } from './mock-tauri';

test.beforeEach(async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
});

test('searching shows results for the query', async ({ page }) => {
  const box = page.getByRole('combobox');
  await box.fill('daft punk');
  await box.press('Enter');
  await expect(page.getByText('Instant Crush (feat. Julian Casablancas)').first()).toBeVisible();
});

test('a search result plays or opens with one click anywhere on its row', async ({ page }) => {
  const box = page.getByRole('combobox', { name: /Search/u });
  await box.fill('daft punk');
  await box.press('Enter');
  const row = page.getByRole('row', { name: /Instant Crush/u }).first();
  await expect(row).toBeVisible();
  // Click the empty space at the right of the row, away from every link and button.
  const bounds = await row.boundingBox();
  if (!bounds) throw new Error('row has no box');
  await page.mouse.click(bounds.x + bounds.width - 120, bounds.y + bounds.height / 2);
  const sent = await page.evaluate(
    () => (window as unknown as { __sent: { type: string }[] }).__sent,
  );
  expect(sent.filter((c) => c.type === 'endpoint')).toHaveLength(1);
});

test('the queue panel lists the page queue and double-click jumps to an item', async ({ page }) => {
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
  await expect(page.getByText('Test mix')).toBeVisible();
  await expect(page.getByText('Three')).toBeVisible();
  await page.getByText('Two').dblclick();
  const sent = await page.evaluate(
    () => (window as unknown as { __sent: { type: string; index?: number }[] }).__sent,
  );
  expect(sent).toContainEqual({ type: 'queueSelect', index: 1 });
});

test('the app reports no unexpected backend calls', async ({ page }) => {
  await page.getByRole('combobox').fill('x');
  const unhandled = await page.evaluate(
    () => (window as unknown as { __unhandled: string[] }).__unhandled,
  );
  // Anything listed here is IPC the mock does not know about yet; add it deliberately.
  expect(unhandled.filter((c) => !c.startsWith('plugin:window|'))).toEqual([]);
});
