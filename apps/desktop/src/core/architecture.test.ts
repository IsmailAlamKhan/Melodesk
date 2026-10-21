import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { discoverFeatures } from './discover';
import { validateFeatures } from './registry';

/**
 * The rules that keep features pluggable: a feature may use the core and the app's shared modules,
 * but another feature only if it declares `dependsOn` for it; and nothing outside a feature may
 * reach into one. Break one and a folder can no longer be deleted without breaking the build.
 */
const SRC = resolve(__dirname, '..');
const FEATURES = join(SRC, 'features');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

const IMPORT = /(?:from|import)\s*\(?\s*['"](\.[^'"]*)['"]/gu;

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(IMPORT)].map((m) => resolve(dirname(file), m[1] ?? ''));
}

/** The feature folder a resolved path lives in, or null if it is not under src/features. */
function featureOf(path: string): string | null {
  const rel = relative(FEATURES, path);
  if (rel.startsWith('..')) return null;
  return rel.split(sep)[0] ?? null;
}

function declaredDeps(id: string): string[] {
  const index = readdirSync(join(FEATURES, id)).find((f) => /^index\.tsx?$/u.test(f));
  if (!index) return [];
  const source = readFileSync(join(FEATURES, id, index), 'utf8');
  const list = /dependsOn:\s*\[([^\]]*)\]/u.exec(source)?.[1] ?? '';
  return [...list.matchAll(/['"]([^'"]+)['"]/gu)].map((m) => m[1] ?? '');
}

const sourceFiles = walk(SRC).filter((f) => /\.tsx?$/u.test(f));

describe('feature boundaries', () => {
  it('a feature imports another feature only if it declares dependsOn for it', () => {
    const violations: string[] = [];
    for (const file of sourceFiles) {
      const own = featureOf(file);
      if (own === null) continue;
      const deps = declaredDeps(own);
      for (const target of importsOf(file)) {
        const other = featureOf(target);
        if (other !== null && other !== own && !deps.includes(other))
          violations.push(`${relative(SRC, file)} imports feature "${other}" without dependsOn`);
      }
    }
    expect(violations).toEqual([]);
  });

  it('nothing outside the features folder imports a feature', () => {
    const violations: string[] = [];
    for (const file of sourceFiles) {
      if (featureOf(file) !== null) continue;
      for (const target of importsOf(file))
        if (featureOf(target) !== null)
          violations.push(`${relative(SRC, file)} imports ${relative(SRC, target)}`);
    }
    expect(violations).toEqual([]);
  });

  it('every folder under features is a feature with an index', () => {
    const folders = readdirSync(FEATURES).filter(
      (n) => statSync(join(FEATURES, n)).isDirectory() && !n.startsWith('_'),
    );
    const missing = folders.filter(
      (n) => !readdirSync(join(FEATURES, n)).some((f) => /^index\.tsx?$/u.test(f)),
    );
    expect(missing).toEqual([]);
  });
});

describe('the built-in features', () => {
  const features = discoverFeatures();

  it('are found, one per folder', () => {
    const folders = readdirSync(FEATURES).filter(
      (n) => statSync(join(FEATURES, n)).isDirectory() && !n.startsWith('_'),
    );
    expect(features.map((f) => f.id).sort()).toEqual(folders.sort());
  });

  it('form a valid set: unique ids, known dependencies, no cycles, no clashing routes', () => {
    expect(validateFeatures(features)).toEqual([]);
  });

  it('declare dependsOn where the boundary check above can read it', () => {
    for (const f of features)
      expect(declaredDeps(f.id).sort()).toEqual([...(f.dependsOn ?? [])].sort());
  });
});
