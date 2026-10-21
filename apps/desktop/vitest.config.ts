import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    server: {
      deps: {
        // material-color-utilities imports its own files without extensions, which Node's ESM
        // loader rejects; bundling it here resolves them the way Vite does for the app.
        inline: [/@material\/material-color-utilities/u],
      },
    },
  },
});
