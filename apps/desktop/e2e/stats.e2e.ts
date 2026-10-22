import { expect, test } from '@playwright/test';
import { emit, installTauri } from './mock-tauri';

test('the stats page shows highlights and a recap that compares with the stretch before', async ({
  page,
}) => {
  await installTauri(page, {
    sql: (query) => {
      if (/COUNT\(DISTINCT CASE WHEN/u.test(query))
        return [{ seconds: 7200, plays: 12, tracks: 8, artists: 3 }];
      // The count of artists first heard in the range (it also groups by name, so ask for it first).
      if (/FROM \(\s*SELECT/u.test(query)) return [{ n: 2 }];
      if (/GROUP BY video_id/u.test(query))
        return [
          {
            video_id: 'v1',
            title: 'Top Song',
            artist: 'Top Artist • Album',
            artwork_url: null,
            plays: 5,
            seconds: 900,
          },
        ];
      if (/GROUP BY name/u.test(query))
        return [{ name: 'Top Artist', artwork_url: null, plays: 9, seconds: 3000 }];
      if (/SELECT DISTINCT date/u.test(query)) {
        const day = (n: number): string => {
          const d = new Date(Date.now() - n * 86_400_000);
          return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        };
        return [{ day: day(2) }, { day: day(1) }, { day: day(0) }];
      }
      if (/played_at >= \$1 AND played_at < \$2/u.test(query)) return [{ seconds: 3600 }];
      if (/strftime\('%H'/u.test(query)) return [{ hour: 21, seconds: 5000 }];
      if (/GROUP BY day/u.test(query)) return [];
      return [];
    },
  });
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Stats' })
    .click();
  const highlights = page.getByRole('region', { name: 'Highlights' });
  await expect(highlights.getByText('3 days', { exact: true })).toBeVisible();
  await expect(highlights.getByText('Best: 3 days')).toBeVisible();
  await expect(highlights.getByText('Evenings')).toBeVisible();
  await expect(highlights.getByText('2', { exact: true })).toBeVisible();
  await expect(page.getByText('Your week')).toBeVisible();
  await expect(page.getByText(/mostly to Top Artist/u)).toBeVisible();
  await expect(page.getByText('100% more listening than the week before.')).toBeVisible();
  await page.getByRole('tab', { name: '30 days' }).click();
  await expect(page.getByText('Your month')).toBeVisible();
  await page.getByRole('tab', { name: 'All time' }).click();
  await expect(page.getByText('Your month')).toHaveCount(0);
  await expect(page.getByText(/listening than the/u)).toHaveCount(0);
});
