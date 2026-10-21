import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Build the app once for the whole run; the tests load it from disk (see serve-built.ts). */
export default function globalSetup(): void {
  const app = join(dirname(fileURLToPath(import.meta.url)), '..');
  execFileSync('pnpm', ['exec', 'vite', 'build', '--outDir', 'dist-e2e', '--emptyOutDir'], {
    cwd: app,
    stdio: 'inherit',
  });
}
