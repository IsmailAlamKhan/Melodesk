# Plugin developer guide

Plugins extend Melodesk without touching playback internals. The SDK lives in
`packages/plugins` and the four first-party plugins (LRCLIB lyrics, Last.fm, ListenBrainz,
Discord Rich Presence) are built on it, so the SDK is exercised by shipping code.

## Add a plugin

A plugin is one file plus one line. About ten minutes for a first one.

1. **Copy the template.** `packages/plugins/src/plugins/_template.ts` is a working plugin that
   needs no network access. Copy it to `packages/plugins/src/plugins/<your-id>.ts` and rename the
   export and the manifest `id`.
2. **Declare what it needs** in the manifest (see the permission table below). Ask only for what
   you use. If it talks to a server, list the exact hostnames in `hosts` and describe in
   `description` what is sent where; users read that text before turning the plugin on.
3. **Register it** in `packages/plugins/src/index.ts`: export it, import it, and add it to
   `firstPartyPlugins` (the order is the order in Settings → Plugins).
4. **Allow its hosts in the shell.** For every entry in `hosts`, add `{ "url": "https://host/*" }`
   to the `http:default` list in `apps/desktop/src-tauri/capabilities/main.json`. A test fails if
   you forget (`features/integrations/capabilities.test.ts`), so this cannot slip through.
5. **Run it.** `pnpm dev`, open Settings → Plugins, switch your plugin on. Its settings fields,
   action buttons and status line show up on its card with no UI work.

Then check it with `pnpm typecheck && pnpm lint && pnpm test`. For logic that does not need the
app (parsing a response, deciding when to scrobble) put the function in the plugin's file or a
small module next to it and unit-test it in `packages/plugins/tests`, as `parseLrc` and
`createScrobbleTracker` are. For behaviour inside the app, see `apps/desktop/e2e/plugins.e2e.ts`;
the mocked backend answers `plugin:http` requests so no test touches the network.

Things plugins cannot do on purpose: read cookies or credentials, touch playback internals, call
arbitrary native commands, or reach hosts they did not declare. A plugin that needs something new
from the app is a request for a new, narrowly scoped permission, not a workaround.

### A plugin that needs Rust code

If the plugin needs a native command (Discord presence does), it is a bigger change: add the command
to the shell, behind an optional Cargo feature with a stub so builds without it still work (see
"Native modules" in [extending.md](extending.md)), add a permission such as `native:<name>` to the
manifest schema, and map the plugin to its native module in `PLUGIN_NEEDS` in
`apps/desktop/src/features/integrations/host.ts` so builds without the module do not offer it.

### Plugin or feature?

If it is part of how Melodesk looks or behaves (a page, a panel, a menu), it is a **feature**:
[extending.md](extending.md). If it sends the user's listening data or fetches from an outside
service, it is a **plugin**, so its access is declared and visible.

### Lyrics plugins

A plugin that returns lyrics sets `provides: ['lyrics']` in its manifest and a `lyricsProvider` on its
instance (see LRCLIB, NetEase and lyrics.ovh). Every enabled lyrics plugin is asked at once, each with a
time limit, and the best answer wins: the first timed result in Settings order, else the first plain
one. Return `null` when you are not sure of the match; wrong lyrics are worse than none (NetEase's
`pickSong` shows one way to check title, artist and length).

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
    linkHosts: [], // hostnames `ctx.openLink` may open (with the open:link permission)
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
| `open:link`        | `ctx.openLink`      | opens an https link in the user's browser; only hosts in the manifest's `linkHosts`                    |
| `native:discord`   | `ctx.native.invoke` | only `discord_set_activity` / `discord_clear`                                                          |

## Settings and lifecycle

Plugins are off by default (`enabledByDefault: false`) and toggled from Settings → Plugins (that
section belongs to the Integrations feature, so switching that feature off hides all plugins and
stops the host), which also renders `settingsFields` and the instance's `actions` and `status()`. Enable
state and settings persist in the local database. `dispose()` runs when a plugin is turned
off.

## Third-party plugins

Loading code from outside the repository is not implemented. The SDK and permission model are
designed so that a sandboxed loader (an isolated worker or iframe with a message bridge) can
be added without changing plugin code; until then, contribute plugins as first-party ones.
