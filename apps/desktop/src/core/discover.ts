import type { Feature } from './feature';

// Every folder in src/features that has an index.ts(x) is a feature; no list to maintain. Folders
// starting with an underscore are templates or work in progress and are ignored.
const modules = import.meta.glob<{ default?: Feature }>('../features/*/index.{ts,tsx}', {
  eager: true,
});

export function discoverFeatures(): Feature[] {
  const found: Feature[] = [];
  for (const [path, mod] of Object.entries(modules)) {
    const folder = /features\/([^/]+)\//u.exec(path)?.[1] ?? '';
    if (folder.startsWith('_')) continue;
    if (mod.default) found.push(mod.default);
    else console.error(`[features] ${path} has no default export; use defineFeature()`);
  }
  return found;
}
