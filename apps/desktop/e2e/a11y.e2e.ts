import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { TRACK, emit, installTauri, startPlayback } from './mock-tauri';
import { openSettings } from './settings-nav';

/**
 * Accessibility audit with axe (WCAG 2.1 A and AA) over the main screens, in the dark and light
 * themes and at phone width. Any violation fails the test, with where it is.
 */
const ART = 'https://i.ytimg.com/vi/sample/hq720.jpg';

async function audit(page: Page, name: string, found: string[]): Promise<void> {
  await page.waitForTimeout(400);
  const result = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  for (const v of result.violations)
    found.push(
      `${name}: ${v.id} (${String(v.impact)}) ×${String(v.nodes.length)} — ${v.nodes
        .slice(0, 2)
        .map((n) => n.target.join(' '))
        .join(' ; ')}`,
    );
}

async function start(page: Page): Promise<void> {
  await installTauri(page);
  await page.goto('/');
  await startPlayback(page, { positionS: 30, track: { ...TRACK, artworkUrl: ART } });
  await emit(page, {
    type: 'queue',
    queue: {
      index: 0,
      shuffle: false,
      repeat: 'off',
      autoplay: true,
      title: 'Mix',
      items: ['One', 'Two'].map((title, i) => ({
        videoId: `v${String(i)}`,
        title,
        artist: 'A',
        album: null,
        artworkUrl: null,
        durationSeconds: 100,
        endpoint: null,
        isAutomix: false,
      })),
    },
  });
}

const primary = (page: Page) => page.getByRole('navigation', { name: 'Primary' });

test('the main screens have no accessibility violations (dark)', async ({ page }) => {
  const found: string[] = [];
  await start(page);
  await audit(page, 'home', found);
  for (const name of ['Explore', 'Library', 'Stats']) {
    await primary(page).getByRole('link', { name }).click();
    await audit(page, name, found);
  }
  for (const name of [
    'General',
    'Appearance',
    'Features',
    'Plugins',
    'Storage',
    'About & updates',
  ]) {
    await openSettings(page, name);
    await audit(page, `settings ${name}`, found);
  }
  await primary(page).getByRole('link', { name: 'Home' }).click();
  await page
    .getByRole('link', { name: /Uncut Bollywood/u })
    .first()
    .click();
  await audit(page, 'playlist', found);
  const box = page.getByRole('combobox', { name: /Search/u });
  await box.fill('daft punk');
  await box.press('Enter');
  await audit(page, 'search results', found);
  await page.keyboard.press('ControlOrMeta+K');
  await audit(page, 'command palette', found);
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Queue' }).first().click();
  await audit(page, 'queue panel', found);
  await page.getByRole('button', { name: 'Queue' }).first().click();
  await page.getByRole('button', { name: 'Open now playing' }).click();
  await audit(page, 'now playing lyrics', found);
  for (const tab of ['Queue', 'Visualizer']) {
    await page.getByRole('tab', { name: tab }).click();
    await audit(page, `now playing ${tab}`, found);
  }
  expect(found).toEqual([]);
});

test('and in the light theme', async ({ page }) => {
  const found: string[] = [];
  await page.addInitScript(() => {
    localStorage.setItem('melodesk.appearance', JSON.stringify({ theme: 'light' }));
  });
  await start(page);
  await audit(page, 'home', found);
  await openSettings(page, 'Appearance');
  await audit(page, 'settings Appearance', found);
  await page.getByRole('button', { name: 'Open now playing' }).click();
  await audit(page, 'now playing', found);
  expect(found).toEqual([]);
});

test.describe('at phone width', () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test('the compact layout has none either', async ({ page }) => {
    const found: string[] = [];
    await start(page);
    await audit(page, 'home', found);
    await openSettings(page, 'Plugins');
    await audit(page, 'settings Plugins', found);
    await page.getByRole('button', { name: 'Open now playing' }).click();
    await audit(page, 'now playing', found);
    expect(found).toEqual([]);
  });
});
