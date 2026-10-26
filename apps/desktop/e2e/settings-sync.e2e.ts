import { expect, test, type Page } from '@playwright/test';
import { emit, installTauri, sentCommands } from './mock-tauri';
import { openSettings } from './settings-nav';

const ready = { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true };

const file = (entries: Record<string, { value: string; updatedAt: number }>): string =>
  JSON.stringify({
    app: 'melodesk',
    kind: 'sync',
    format: 1,
    device: 'other',
    exportedAt: '2026-10-26T00:00:00.000Z',
    entries,
  });

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await emit(page, ready);
  await openSettings(page, 'Storage');
}

test('choosing a folder writes this computer’s settings into it', async ({ page }) => {
  await installTauri(page, {
    sync: { folder: '/Cloud/Melodesk' },
    kv: { 'audio:prefs': '{"eqEnabled":true}', 'server:config': 'never synced' },
  });
  await open(page);
  await expect(page.getByText('Not syncing.')).toBeVisible();
  await page.getByRole('button', { name: 'Choose a folder' }).click();
  await expect(page.getByText('/Cloud/Melodesk')).toBeVisible();
  await expect(page.getByText(/Last synced/u)).toBeVisible();
  // The appearance choices the app saved at start are in the file; folders and servers never are.
  await expect
    .poll(async () => {
      const written = (await sentCommands(page)).find((c) => c['type'] === 'sync_write');
      return typeof written?.['text'] === 'string' ? written['text'] : '';
    })
    .toContain('audio:prefs');
  const written = (await sentCommands(page)).find((c) => c['type'] === 'sync_write');
  expect(String(written?.['text'])).not.toContain('server:config');
});

test('settings another computer changed more recently are taken, and the app offers a reload', async ({
  page,
}) => {
  await installTauri(page, {
    sync: {
      folder: '/Cloud/Melodesk',
      file: file({ 'lyrics:prefs': { value: '{"fromOther":true}', updatedAt: 4_000_000_000_000 } }),
    },
    kv: { 'sync:folder': '/Cloud/Melodesk' },
  });
  await page.goto('/');
  await emit(page, ready);
  await expect(
    page.getByText('Settings from another computer were applied. Reload to use them.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Later' }).click();
  await expect(page.getByText('Settings from another computer were applied.')).toHaveCount(0);
});

test('a file in the folder that is not ours is left alone', async ({ page }) => {
  await installTauri(page, {
    sync: { folder: '/Cloud/Melodesk', file: 'hello, not json' },
    kv: { 'sync:folder': '/Cloud/Melodesk' },
  });
  await open(page);
  await expect(
    page.getByRole('alert').filter({ hasText: 'not a Melodesk sync file' }),
  ).toBeVisible();
  const sent = await sentCommands(page);
  expect(sent.some((c) => c['type'] === 'sync_write')).toBe(false);
});
