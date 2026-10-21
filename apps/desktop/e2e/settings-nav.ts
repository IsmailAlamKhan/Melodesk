import type { Page } from '@playwright/test';

/** Open Settings, and one of its pages ("Features & plugins", "Appearance"…) if given. */
export async function openSettings(page: Page, category?: string): Promise<void> {
  await page
    .getByRole('navigation', { name: 'Primary' })
    .getByRole('link', { name: 'Settings' })
    .click();
  if (category)
    await page
      .getByRole('navigation', { name: 'Settings pages' })
      .getByRole('link', { name: category })
      .click();
}
