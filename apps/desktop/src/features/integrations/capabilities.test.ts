import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PluginManifestSchema, firstPartyPlugins } from '@melodesk/plugins';
import { describe, expect, it } from 'vitest';

interface HttpScope {
  identifier: string;
  allow?: { url: string }[];
}

/** A plugin that fetches a host the shell does not allow would only fail at run time; fail here. */
describe('plugin hosts and the shell capability file', () => {
  const capabilities = JSON.parse(
    readFileSync(resolve(__dirname, '../../../src-tauri/capabilities/main.json'), 'utf8'),
  ) as { permissions: (string | HttpScope)[] };
  const http = capabilities.permissions.find(
    (p): p is HttpScope => typeof p !== 'string' && p.identifier === 'http:default',
  );
  const allowed = (http?.allow ?? []).map((a) => new URL(a.url.replace(':*', '')).hostname);

  it('every host a first-party plugin fetches is allowed in capabilities/main.json', () => {
    for (const p of firstPartyPlugins) {
      const manifest = PluginManifestSchema.parse(p.manifest);
      for (const host of manifest.hosts)
        expect(allowed, `${manifest.id} fetches ${host}, add it to http:default`).toContain(host);
    }
  });

  it('plugin ids are unique', () => {
    const ids = firstPartyPlugins.map((p) => p.manifest.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
