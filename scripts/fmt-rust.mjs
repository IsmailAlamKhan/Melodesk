// rustfmt over the Rust sources, without relying on the shell to expand a glob (cmd.exe does not).
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = join('apps', 'desktop', 'src-tauri');
const files = [
  ...readdirSync(join(root, 'src'))
    .filter((f) => f.endsWith('.rs'))
    .map((f) => join(root, 'src', f)),
  join(root, 'build.rs'),
];
const write = process.argv.includes('--write');
const result = spawnSync(
  'rustfmt',
  ['--edition', '2021', ...(write ? [] : ['--check']), ...files],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
