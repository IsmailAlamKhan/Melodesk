# Plugin developer guide

Plugins extend Melodesk without touching playback internals. The SDK lives in
`packages/plugins` and the four first-party plugins (LRCLIB lyrics, Last.fm, ListenBrainz,
Discord Rich Presence) are built on it, so the SDK is exercised by shipping code.

## Shape of a plugin

```ts
import { definePlugin } from '@melodesk/plugins';

export const myPlugin = definePlugin({
  manifest: {
    id: 'my-plugin',
    name: 'My plugin',
    version: '1.0.0',
    description: 'What it does, and what data it sends where.',
    permissions: ['playback:read', 'network:fetch', 'storage:plugin'],
    hosts: ['api.example.com'], // required with network:fetch; exact hostnames, https only
  },
  settingsFields: [{ key: 'token', label: 'API token', type: 'password' }],
  setup(ctx) {
    const stop = ctx.player?.onTrackChange((track) => {
      /* … */
    });
    return {
      status: () => 'Idle',
      actions: [{ label: 'Test', run: async () => {} }],
      lyricsProvider: async (track) => null, // optional: lyrics when YouTube has none
      dispose: () => stop?.(),
    };
  },
});
```

## Permissions → capabilities

The host builds the `ctx` object from the manifest. A capability is simply absent when its
permission is not declared, so there is nothing to "escape" from.

| Permission         | Capability          | Notes                                                                                                  |
| ------------------ | ------------------- | ------------------------------------------------------------------------------------------------------ |
| `playback:read`    | `ctx.player`        | current track/state, change events                                                                     |
| `playback:control` | `ctx.control`       | play/pause/next/previous/seek                                                                          |
| `network:fetch`    | `ctx.fetch`         | https only, hosts from the manifest, via Tauri's HTTP plugin (also scoped in `capabilities/main.json`) |
| `storage:plugin`   | `ctx.storage`       | key/value in the local SQLite, namespaced per plugin                                                   |
| `notifications`    | `ctx.notify`        | in-app toast                                                                                           |
| `native:discord`   | `ctx.native.invoke` | only `discord_set_activity` / `discord_clear`                                                          |

## Settings and lifecycle

Plugins are off by default (`enabledByDefault: false`) and toggled from Settings → Plugins,
which also renders `settingsFields` and the instance's `actions` and `status()`. Enable
state and settings persist in the local database. `dispose()` runs when a plugin is turned
off.

## Third-party plugins

Loading code from outside the repository is not implemented. The SDK and permission model are
designed so that a sandboxed loader (an isolated worker or iframe with a message bridge) can
be added without changing plugin code; until then, contribute plugins as first-party ones.
