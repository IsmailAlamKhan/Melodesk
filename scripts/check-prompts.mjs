// Keeps the prompts folder honest: every numbered prompt has the same sections, the index lists every
// file and every link in it resolves, and files named in backticks as paths under apps/ or packages/ exist.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../..');
const dir = join(root, 'prompts');
const problems = [];

const files = readdirSync(dir).filter((f) => /^\d\d-.+\.md$/u.test(f));
const REQUIRED = ['Goal', 'Needs', 'Build', 'Acceptance', 'Known limits'];
const EXEMPT = new Set(['00-charter.md', '90-gotchas.md', '91-status.md']);

for (const f of files) {
  const text = readFileSync(join(dir, f), 'utf8');
  if (EXEMPT.has(f)) continue;
  const headings = new Set([...text.matchAll(/^## (.+)$/gmu)].map((m) => m[1]?.trim()));
  for (const h of REQUIRED) if (!headings.has(h)) problems.push(`${f}: missing "## ${h}"`);
}

const index = readFileSync(join(dir, 'README.md'), 'utf8');
for (const f of files)
  if (!index.includes(`(${f})`)) problems.push(`README.md: does not list ${f}`);
for (const m of index.matchAll(/\]\(([^)#]+\.md)\)/gu))
  if (!existsSync(join(dir, m[1] ?? ''))) problems.push(`README.md: broken link ${m[1]}`);

// Paths the prompts name as code (src-tauri/..., features/..., packages/...) must exist somewhere.
const known = (p) =>
  [
    root,
    join(root, 'apps/desktop'),
    join(root, 'apps/desktop/src'),
    join(root, 'apps/desktop/src-tauri'),
    join(root, 'apps/desktop/src-tauri/src'),
    join(root, 'apps/desktop/e2e'),
    join(root, 'apps/desktop/src/features'),
    join(root, 'packages'),
    join(root, 'packages/bridge/src'),
    join(root, 'packages/plugins/src'),
    join(root, 'packages/adapter/src'),
    join(root, 'apps/sync-server'),
    join(root, 'apps/sync-server/src'),
  ].some((base) => existsSync(join(base, p)));
for (const f of files) {
  if (f.startsWith('99-')) continue; // planned, so its files do not exist yet
  const text = readFileSync(join(dir, f), 'utf8');
  for (const m of text.matchAll(
    /`((?:[\w.-]+\/)+[\w.\[\]-]+\.(?:ts|tsx|rs|json|sql|md|mjs|yml|toml))`/gu,
  )) {
    const p = m[1] ?? '';
    if (p.includes('<') || p.includes('*')) continue;
    if (!known(p)) problems.push(`${f}: \`${p}\` does not exist`);
  }
}

if (problems.length > 0) {
  console.error(problems.join('\n'));
  process.exit(1);
}
console.log(`prompts: ${String(files.length)} files ok`);
