/**
 * A starting point for a plugin. Copy this file to `<your-id>.ts`, rename `template`, then follow
 * docs/plugins.md ("Add a plugin"). Files starting with "_" are not part of the app until you
 * copy them and register the copy in `src/index.ts`.
 *
 * This example needs no network access: it counts the tracks played in this session and shows
 * the count as its status line.
 */
import { definePlugin } from '../sdk';

export const template = definePlugin({
  manifest: {
    // Lowercase letters, digits and dashes. It namespaces the plugin's saved settings, so never change it later.
    id: 'template',
    name: 'Template',
    version: '1.0.0',
    // Say what it does and what data it sends where: users read this before turning it on.
    description: 'Counts the tracks played this session. Sends nothing anywhere.',
    // Ask only for what you use; a capability you do not declare is simply missing from `ctx`.
    // 'network:fetch' needs `hosts: ['api.example.com']` here and the same URL in
    // apps/desktop/src-tauri/capabilities/main.json. 'open:link' needs `linkHosts`.
    permissions: ['playback:read'],
    // Plugins that send data stay off until the user turns them on (the default).
    enabledByDefault: false,
  },
  // Rendered as inputs on the plugin's card in Settings → Plugins; values arrive in `ctx.settings`.
  settingsFields: [
    {
      key: 'label',
      label: 'Label',
      type: 'text',
      hint: 'Shown before the count',
      default: 'Played',
    },
  ],
  setup(ctx) {
    let played = 0;
    const stop = ctx.player?.onTrackChange((track) => {
      if (track) played += 1;
    });
    const stopSettings = ctx.onSettingsChange(() => undefined);
    return {
      status: () => `${String(ctx.settings['label'] ?? 'Played')}: ${String(played)}`,
      actions: [
        {
          label: 'Reset count',
          run: () => {
            played = 0;
            return Promise.resolve();
          },
        },
      ],
      // Runs when the user turns the plugin off: undo everything `setup` started.
      dispose: () => {
        stop?.();
        stopSettings();
      },
    };
  },
});
