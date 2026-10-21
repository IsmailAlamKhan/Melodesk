import { expect, test } from '@playwright/test';
import { emit, installTauri } from './mock-tauri';

test('a page that throws shows an apology, and the rest of the app still works', async ({
  page,
}) => {
  await installTauri(page);
  // Make date formatting fail on demand: the Stats page needs it to draw its charts.
  await page.addInitScript(() => {
    const w = window as unknown as { __breakDates?: boolean };
    const Original = Intl.DateTimeFormat;
    Intl.DateTimeFormat = new Proxy(Original, {
      construct(target, args: ConstructorParameters<typeof Intl.DateTimeFormat>) {
        if (w.__breakDates) throw new Error('boom');
        return new target(...args);
      },
    });
  });
  await page.goto('/');
  await emit(page, { type: 'ready', bridgeVersion: '0.1.0', protocolVersion: 1, loggedIn: true });
  await expect(page.getByRole('heading', { name: 'Indian Music' })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __breakDates: boolean }).__breakDates = true;
  });
  const consoleErrors: string[] = [];
  page.on('pageerror', (e) => consoleErrors.push(e.message));
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Stats' })
    .click();
  const apology = page.getByRole('alert').filter({ hasText: 'Something went wrong' });
  await expect(apology).toBeVisible();
  // The shell around the page is still there, and so is the way out.
  await expect(page.getByRole('navigation', { name: 'Primary' })).toBeVisible();
  await page.evaluate(() => {
    (window as unknown as { __breakDates: boolean }).__breakDates = false;
  });
  await apology.getByRole('button', { name: 'Go to Home' }).click();
  await expect(page.getByRole('heading', { name: 'Indian Music' })).toBeVisible();
  await expect(apology).toHaveCount(0);
  // And a later visit to the same page starts fresh.
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Stats' })
    .click();
  await expect(page.getByRole('heading', { name: 'Your listening' })).toBeVisible();
});
