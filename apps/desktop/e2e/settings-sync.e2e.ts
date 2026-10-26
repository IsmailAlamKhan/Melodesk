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
  await expect(page.getByText(/Not syncing yet/u)).toBeVisible();
  await page.getByRole('button', { name: 'Choose another folder…' }).click();
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

test('a folder that is a git repository says so', async ({ page }) => {
  await installTauri(page, { sync: { folder: '/Code/melodesk-settings', git: true } });
  await open(page);
  await page.getByRole('button', { name: 'Choose another folder…' }).click();
  await expect(page.getByText(/This folder is a git repository/u)).toBeVisible();
});

test('a cloud folder this computer has is one click away', async ({ page }) => {
  await installTauri(page, {
    sync: {
      folder: '/unused',
      clouds: [
        { id: 'icloud', name: 'iCloud Drive', path: '/Users/me/iCloud' },
        { id: 'dropbox', name: 'Dropbox', path: '/Users/me/Dropbox' },
      ],
    },
    kv: { 'audio:prefs': '{"eqEnabled":true}' },
  });
  await open(page);
  await expect(page.getByRole('button', { name: 'Sign in with GitHub' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Use iCloud Drive' }).click();
  await expect(page.getByText('Syncing through iCloud Drive.')).toBeVisible();
  await expect(page.getByText('/Users/me/iCloud/Melodesk')).toBeVisible();
  await expect
    .poll(async () => (await sentCommands(page)).some((c) => c['type'] === 'sync_write'))
    .toBe(true);
});

test('signing in with GitHub shows a code, waits for approval, then syncs through the account', async ({
  page,
}) => {
  await installTauri(page, {
    sync: { folder: '/unused', github: { code: 'WDJB-MJHT', pendingPolls: 1, login: 'ann' } },
    kv: { 'audio:prefs': '{"eqEnabled":true}' },
  });
  await open(page);
  await page.getByRole('button', { name: 'Sign in with GitHub' }).click();
  await expect(page.getByLabel('Code to type at GitHub')).toHaveText('WDJB-MJHT');
  await expect(page.getByText(/only for permission to use your gists/u)).toBeVisible();
  await expect(page.getByText('Syncing through GitHub as ann.')).toBeVisible({ timeout: 15_000 });
  await expect(page.getByLabel('Code to type at GitHub')).toHaveCount(0);
  await expect
    .poll(async () => (await sentCommands(page)).some((c) => c['type'] === 'sync_write'))
    .toBe(true);
  // Stopping signs out: the token is forgotten.
  await page.getByRole('button', { name: 'Stop syncing' }).click();
  await expect
    .poll(async () => (await sentCommands(page)).some((c) => c['type'] === 'sync_github_sign_out'))
    .toBe(true);
  await expect(page.getByText(/Not syncing yet/u)).toBeVisible();
});

test('the Melodesk sync server: start, see the code, and everything sent is unreadable', async ({
  page,
}) => {
  await installTauri(page, {
    sync: { folder: '/unused', server: { url: 'https://sync.example.com' } },
    kv: {
      'audio:prefs': '{"eqEnabled":true}',
      'plugin:lastfm:settings': '{"username":"ann","sessionKey":"TOP-SECRET-KEY"}',
      'server:config': '{"url":"https://m.example.com","user":"ann","password":"hunter2"}',
    },
  });
  await open(page);
  // The address the build comes with is filled in.
  await expect(page.getByLabel('Server address')).toHaveValue('https://sync.example.com');
  await page.getByRole('button', { name: /Start syncing/u }).click();
  const code = page.getByLabel('Your sync code').last();
  await expect(code).toHaveText(/^[A-Z2-7]{4}(-[A-Z2-7]{4}){4}$/u);
  await expect(page.getByText('Syncing through the Melodesk sync server')).toBeVisible();
  await expect
    .poll(async () => (await sentCommands(page)).some((c) => c['type'] === 'sync_server_put'))
    .toBe(true);
  // What went to the server is encrypted: none of the sign-ins, nor the settings' names, can be read.
  const put = (await sentCommands(page)).find((c) => c['type'] === 'sync_server_put');
  const sent = String(put?.['data']);
  for (const secret of ['TOP-SECRET-KEY', 'hunter2', 'audio:prefs', 'lastfm', 'eqEnabled'])
    expect(sent).not.toContain(secret);
  await page.getByRole('button', { name: 'I have saved it' }).click();
  await expect(page.getByLabel('Your sync code')).toHaveCount(0);
  // It can be shown again later.
  await page.getByRole('button', { name: 'Show my sync code' }).click();
  await expect(page.getByLabel('Your sync code').last()).toHaveText(
    /^[A-Z2-7]{4}(-[A-Z2-7]{4}){4}$/u,
  );
});

test('joining needs a real code, and a code with nothing under it is not accepted', async ({
  page,
}) => {
  await installTauri(page, {
    sync: { folder: '/unused', server: { url: 'https://sync.example.com' } },
  });
  await open(page);
  await page.getByRole('button', { name: 'I already have a sync code' }).click();
  await page.getByLabel('Sync code from your other computer').fill('nope');
  await page.getByRole('button', { name: 'Join with this code' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'not a sync code' })).toBeVisible();
  await page.getByLabel('Sync code from your other computer').fill('abcd-efgh-ijkl-mnop-qrst');
  await page.getByRole('button', { name: 'Join with this code' }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'Nothing is saved under that code' }),
  ).toBeVisible();
});

test('an address with no sync server on it is said so', async ({ page }) => {
  await installTauri(page, { sync: { folder: '/unused' } });
  await open(page);
  await page.getByLabel('Server address').fill('https://nothing-here.example.com');
  await page.getByRole('button', { name: /Start syncing/u }).click();
  await expect(
    page.getByRole('alert').filter({ hasText: 'no Melodesk sync server' }),
  ).toBeVisible();
});
