import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Build the app once for the whole run; the tests load it from disk (see serve-built.ts). */
export default function globalSetup(): void {
  const app = join(dirname(fileURLToPath(import.meta.url)), '..');
  try {
    execFileSync('pnpm', ['exec', 'vite', 'build', '--outDir', 'dist-e2e', '--emptyOutDir'], {
      cwd: app,
      stdio: 'pipe',
    });
  } catch (err) {
    // Say why the build failed, not just that it did.
    const out = err as { stdout?: Buffer; stderr?: Buffer };
    throw new Error(`The app did not build:\n${String(out.stdout)}\n${String(out.stderr)}`, {
      cause: err,
    });
  }
}
