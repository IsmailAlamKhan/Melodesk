import { existsSync, readFileSync } from 'node:fs';
import { dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const dist = join(dirname(fileURLToPath(import.meta.url)), '../dist-e2e');

/** The address tests load the app from. It has no server: the files come from disk (below). */
export const APP_ORIGIN = 'https://melodesk.test';

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
};

/**
 * Serve the built app to the page straight from `dist-e2e`, without a network connection. Tests used
 * to load it over localhost, which broke whenever something on the machine (a VPN's firewall, a
 * security tool) interfered with loopback connections; this cannot. It is an https origin so the page
 * is a secure context, as it is inside Tauri.
 */
export async function serveBuiltApp(page: Page): Promise<void> {
  await page.route(`${APP_ORIGIN}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    let file = join(dist, decodeURIComponent(pathname));
    if (pathname === '/' || !existsSync(file) || !extname(file)) file = join(dist, 'index.html');
    await route.fulfill({
      status: 200,
      contentType: TYPES[extname(file)] ?? 'application/octet-stream',
      body: readFileSync(file),
    });
  });
}
