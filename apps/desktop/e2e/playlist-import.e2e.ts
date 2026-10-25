import { expect, test } from '@playwright/test';
import { emit, installTauri, sentCommands } from './mock-tauri';

const CSV =
  'Track Name,Artist Name(s),Album Name\n' +
  'Instant Crush,Daft Punk,Random Access Memories\n' +
  'Zzzz Nonexistent Tune,Nobody At All,Nothing\n';

test('a playlist file is matched to YouTube Music songs and made into a playlist', async ({
  page,
}) => {
  await installTauri(page, { importFile: { path: '/home/me/Road Trip.csv', text: CSV } });
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await page.getByRole('button', { name: 'Import a playlist…' }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a playlist' });
  await dialog.getByRole('button', { name: 'Choose a file…' }).click();
  await expect(dialog.getByText('1 of 2 songs found')).toBeVisible();
  await expect(dialog.getByText('No match, this one is left out')).toBeVisible();
  await expect(dialog.getByLabel('Playlist name')).toHaveValue('Road Trip');
  await dialog.getByRole('button', { name: 'Create playlist with 1 songs' }).click();

  await expect
    .poll(async () =>
      (await sentCommands(page)).find(
        (c) => c['type'] === 'data' && c['endpoint'] === 'playlist/create',
      ),
    )
    .toMatchObject({ body: { title: 'Road Trip', privacyStatus: 'PRIVATE' } });
  const created = (await sentCommands(page)).find(
    (c) => c['type'] === 'data' && c['endpoint'] === 'playlist/create',
  ) as { body: { videoIds: string[] } };
  expect(created.body.videoIds).toHaveLength(1);
  // It lands on the new playlist's page (the app keeps its address in memory, so the proof is that the
  // page asked for it).
  await expect
    .poll(async () =>
      (await sentCommands(page)).some(
        (c) =>
          c['type'] === 'data' &&
          c['endpoint'] === 'browse' &&
          (c['body'] as { browseId?: string }).browseId === 'VLPLimported1',
      ),
    )
    .toBe(true);
});

test('a file with no songs says so', async ({ page }) => {
  await installTauri(page, { importFile: { path: '/x/empty.csv', text: 'nothing,here\n' } });
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await page.keyboard.press('ControlOrMeta+K');
  await page.getByRole('option', { name: /Import a playlist/u }).click();
  const dialog = page.getByRole('dialog', { name: 'Import a playlist' });
  await dialog.getByRole('button', { name: 'Choose a file…' }).click();
  await expect(dialog.getByRole('alert')).toContainText('No songs were found in that file.');
});
