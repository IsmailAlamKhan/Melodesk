# Adding and removing parts of Melodesk

Almost everything you see in the app is a **feature**: a folder in `apps/desktop/src/features/`.
Add a folder and the feature is part of the app; delete the folder and it is gone. Nothing else
needs editing: there is no list of features to update, no route table, no menu to patch.

```
src/features/
  lyrics/          panel, toolbar, now-playing column, palette command, "View" menu entry
  queue/           the queue panel
  stats/           the Stats page, its sidebar link, and a recorder that runs in the background
  mini-player/     the second window and the buttons that open it
  …                (home, browse, search, detail, library, settings, karaoke, now-playing,
                   command-palette, context-menu, global-shortcuts, offline-artwork,
                   integrations, audio-engine, queue-tools, playlist-tools)
```

The `core/` folder is the small framework underneath (registry, slots, hooks). The `app/` folder
is the shell around the features: the window layout, sidebar, player bar and shared components. They
contain no knowledge of any particular feature.

## Features and plugins are different layers

|                | Feature                                 | Plugin (`packages/plugins`)                            |
| -------------- | --------------------------------------- | ------------------------------------------------------ |
| Who writes it  | Melodesk itself                         | Anyone, eventually                                     |
| Trust          | Full access to the app, like any module | Sandboxed: only the permissions in its manifest        |
| Can add        | Pages, panels, buttons, menus, windows… | Lyrics, scrobbling, presence: through the SDK          |
| Switched on in | Settings → Features                     | Settings → Plugins (shown by the Integrations feature) |

Use a feature for anything that is part of the application. Use a plugin for something that talks to
an outside service with the user's data, so the user can see and limit what it may do. See
[plugins.md](plugins.md).

## Add a feature

1. Copy `src/features/_template` to `src/features/<id>` (lowercase, dashes; the folder name is the id).
2. Edit `index.tsx`. It default-exports `defineFeature({ … })`.
3. Add its name and description to `src/i18n/locales/en.json` as `feature.<id>.name` and
   `feature.<id>.description`.

That is all. Run `pnpm dev` and it appears under Settings → Features, where the user can turn it off.

```tsx
import { Sparkles } from 'lucide-react';
import { defineFeature } from '../../core';
import { Page } from './Page';

export default defineFeature({
  id: 'sparkles',
  name: 'feature.sparkles.name',
  description: 'feature.sparkles.description',
  icon: Sparkles,
  contributes: {
    routes: [{ path: '/sparkles', element: <Page /> }],
    nav: [{ id: 'sparkles', to: '/sparkles', label: 'nav.sparkles', icon: Sparkles, order: 50 }],
  },
});
```

## What a feature can contribute

Everything goes under `contributes`; each key is an extension point.

| Key         | Adds                                                                                      |
| ----------- | ----------------------------------------------------------------------------------------- |
| `routes`    | Pages (React Router route objects; they render inside the app layout)                     |
| `nav`       | Sidebar links (`placement: 'bottom'` pins one above the footer)                           |
| `panels`    | Panels in the right-hand column, with a toggle button in the top bar                      |
| `overlays`  | Components that are always mounted outside the page: full-screen views, dialogs           |
| `providers` | Components that wrap the whole app (context providers, the right-click menu)              |
| `slots`     | Components placed at named spots, see below                                               |
| `commands`  | Entries in the command palette (a function, so labels follow the language and live state) |
| `menus`     | Entries in the right-click menu: `root`, `go` (Go to) or `view` (View)                    |
| `settings`  | Sections on the Settings page                                                             |
| `windows`   | The content of an extra native window, keyed by its `?window=` name                       |

Outside `contributes`:

- `start()` runs while the feature is on. Return a function to undo what it did; it runs when the
  feature is switched off. By default it runs in the main window only (`scope: 'all'` also runs it in
  the mini player).
- `core: true` marks something the app cannot work without: always on, hidden from the Features list.
- `defaultEnabled: false` keeps it off until the user turns it on.
- `dependsOn: ['other']` lists features that must be on for this one to be. Turning this feature on
  turns those on too.
- `requires: ['discord']` lists native modules (see below). The feature is off in a build without them.

### Slots

A slot is a named place where several features can add something without knowing each other.
`<Slot name="…"/>` renders everything contributed, ordered by `order` (default 100), each inside an
error boundary so one broken contribution cannot take the page down.

| Slot                | Where                                         | Props                                     |
| ------------------- | --------------------------------------------- | ----------------------------------------- |
| `topBar.center`     | Middle of the top bar (the search field)      |                                           |
| `topBar.end`        | Right of the top bar, after the panel toggles |                                           |
| `playerBar.end`     | Right end of the player bar                   |                                           |
| `sidebar.sections`  | Below the sidebar navigation                  |                                           |
| `nowPlaying.header` | Buttons in the full-screen Now Playing header |                                           |
| `nowPlaying.side`   | A column beside the artwork                   |                                           |
| `lyrics.toolbar`    | Buttons in the lyrics toolbar                 |                                           |
| `queue.header`      | Actions in the queue panel header             |                                           |
| `playlist.header`   | Actions in a playlist's header                | title, playlistId, tracks, editable, sort |

To add a new slot: add it to `SlotMap` in `core/feature.ts` (with its props), then put
`<Slot name="your.slot" …/>` where it belongs.

## How features talk to each other

A feature may import from `core/`, `app/` and the other shared folders (`player/`, `data/`,
`i18n/`, `settings/`, `appearance/`). It may import another feature's files only if it lists that
feature in `dependsOn`. A test (`core/architecture.test.ts`) enforces this, together with: nothing
outside `features/` imports a feature, and the built-in features form a valid set (unique ids, known
dependencies, no cycles, no two routes with the same path).

For everything else there are three loose ways to cooperate:

- **Slots and menus** (above): the host declares a place, features fill it.
- **Actions**: `registerAction('nowPlaying.open', fn)` while on, `runAction('nowPlaying.open')` from
  anywhere. It does nothing when the feature is off, and `useHasAction(id)` lets a button hide itself.
  `navigateTo('/path')` is the same idea for navigation.
- **Services**: `createRegistry<T>()` in `core/services.ts` is a small list features register into.
  `lyricsSources` is one: the Integrations feature registers LRCLIB, and the lyrics feature asks it.

## Native modules

Some features depend on code in the Rust shell. Those parts are Cargo features of
`apps/desktop/src-tauri` (`discord`, `shortcuts`), all on by default:

```bash
cargo build --no-default-features                       # neither
cargo build --no-default-features --features discord    # only Discord presence
```

A module that is not built still answers its commands ("not available") so the rest compiles and
runs. The shell's `native_modules` command lists what the build has, and any feature with
`requires: ['discord']` turns itself off, with a note in Settings → Features. `tauri.conf.json` lists
the modules in `build.features` because `tauri dev` passes `--no-default-features`.

To add a module: put it behind a Cargo feature (an `optional = true` dependency if it has one),
add a stub that keeps the command names, report it in `native_modules` in `lib.rs`, and add the
feature to `build.features`.

## Remove a feature

Delete its folder. Everything that feature added is gone and the app still builds, unless another
feature lists it in `dependsOn`; then delete that one too (this is the point of declaring it). To ship
a build without something, that is all there is to do. To merely hide it, set `defaultEnabled: false`.

CI type-checks the app with each feature folder removed in turn, so "deleting it breaks nothing" stays true.

## Testing a feature

- Unit-test pure logic next to the code (`*.test.ts`, run with `pnpm test`).
- Test behaviour end to end with Playwright (`apps/desktop/e2e`); `mock-tauri.ts` stands in for the
  Rust shell. `e2e/features.e2e.ts` shows how to check that a feature's UI disappears when it is switched off.
