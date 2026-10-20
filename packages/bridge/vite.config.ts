import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

// Builds the injected script as a single self-contained IIFE. The Rust side embeds
// dist/bridge.js at compile time with include_str!, so there is no runtime file to tamper with.
export default defineConfig({
  define: {
    __BRIDGE_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    minify: true,
    sourcemap: false,
    target: ['safari16', 'chrome110'],
    lib: {
      entry: 'src/inject/main.ts',
      name: 'MelodeskBridge',
      formats: ['iife'],
      fileName: () => 'bridge.js',
    },
  },
});
