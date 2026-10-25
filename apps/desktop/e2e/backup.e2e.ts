import { expect, test } from '@playwright/test';
import { emit, installTauri, sentCommands } from './mock-tauri';
import { openSettings } from './settings-nav';

const BACKUP = JSON.stringify({
  app: 'melodesk',
  format: 1,
  exportedAt: '2026-03-04T05:06:07.000Z',
  settings: { 'restored:flag': 'yes', 'plugin:x:store:token': 'must-not-come-back' },
});

test('a backup is written to a file the user picks', async ({ page }) => {
  await installTauri(page);
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await openSettings(page, 'Storage');
  await page.getByRole('button', { name: 'Back up…' }).click();
  await expect(page.getByText('Backup saved')).toBeVisible();
  expect((await sentCommands(page)).some((c) => c['type'] === 'write_text_file')).toBe(true);
});

test('a backup is read, confirmed and put back, without secrets', async ({ page }) => {
  await installTauri(page, { importFile: { path: '/home/me/backup.json', text: BACKUP } });
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await openSettings(page, 'Storage');
  await page.getByRole('button', { name: 'Restore…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Restore this backup?' });
  await expect(dialog.getByText(/1 settings from 2026-03-04/u)).toBeVisible();
  await dialog.getByRole('button', { name: 'Restore' }).click();
  await expect
    .poll(async () =>
      page.evaluate(() => {
        const kv = JSON.parse(localStorage.getItem('__mockKv') ?? '[]') as [string, string][];
        return Object.fromEntries(kv);
      }),
    )
    .toMatchObject({ 'restored:flag': 'yes' });
  const kv = await page.evaluate(() => localStorage.getItem('__mockKv') ?? '');
  expect(kv).not.toContain('must-not-come-back');
});

test('a file that is not a backup is refused', async ({ page }) => {
  await installTauri(page, { importFile: { path: '/home/me/other.json', text: '{"hello":1}' } });
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await openSettings(page, 'Storage');
  await page.getByRole('button', { name: 'Restore…' }).click();
  await expect(page.getByRole('alert')).toContainText('That is not a Melodesk backup.');
});
