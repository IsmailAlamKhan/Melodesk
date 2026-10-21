// Proves "delete the folder and nothing breaks": type-checks the app once for every feature, with
// that feature's folder moved out of the way. A feature that other features list in `dependsOn` is
// skipped, since deleting it means deleting them too (which is what the declaration is for).
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const app = resolve(fileURLToPath(import.meta.url), '../../apps/desktop');
const features = join(app, 'src/features');

const ids = readdirSync(features).filter(
  (n) => statSync(join(features, n)).isDirectory() && !n.startsWith('_'),
);

function declaredDeps(id) {
  const index = readdirSync(join(features, id)).find((f) => /^index\.tsx?$/u.test(f));
  if (!index) return [];
  const list =
    /dependsOn:\s*\[([^\]]*)\]/u.exec(readFileSync(join(features, id, index), 'utf8'))?.[1] ?? '';
  return [...list.matchAll(/['"]([^'"]+)['"]/gu)].map((m) => m[1]);
}

const deps = new Map(ids.map((id) => [id, declaredDeps(id)]));
const stash = mkdtempSync(join(tmpdir(), 'melodesk-features-'));
const failures = [];
const bin = join(app, 'node_modules/.bin/tsc');

for (const id of ids) {
  if ([...deps].some(([other, d]) => other !== id && d.includes(id))) {
    console.log(`skip  ${id} (other features depend on it)`);
    continue;
  }
  const from = join(features, id);
  const to = join(stash, id);
  cpSync(from, to, { recursive: true });
  rmSync(from, { recursive: true });
  try {
    execFileSync(bin, ['-p', 'tsconfig.json', '--noEmit'], { cwd: app, stdio: 'pipe' });
    console.log(`ok    without ${id}`);
  } catch (err) {
    failures.push(id);
    console.log(`FAIL  without ${id}\n${String(err.stdout).split('\n').slice(0, 5).join('\n')}`);
  } finally {
    cpSync(to, from, { recursive: true });
  }
}
rmSync(stash, { recursive: true });
if (!existsSync(join(features, ids[0]))) throw new Error('features were not restored');
if (failures.length > 0) {
  console.error(`\nThese features cannot be deleted cleanly: ${failures.join(', ')}`);
  process.exit(1);
}
