# 03 — The feature framework

## Goal

The UI is assembled from independent, removable **features**. Adding a folder under
`apps/desktop/src/features/<id>/` with an `index.ts(x)` that default-exports `defineFeature({...})`
plugs it in; deleting the folder removes it. Users can switch non-core features off at runtime in
Settings → Features.

## Needs

00, 01.

## Constraints

- A feature may import the core (`src/core`), shared app modules and packages, but **another feature
  only if it lists it in `dependsOn`**; nothing outside `features/` may import a feature
  (`core/architecture.test.ts` enforces both, plus: ids unique, deps known, no cycles, no clashing routes,
  and that `dependsOn` is readable by the checker).
- A `core: true` feature cannot be switched off and cannot depend on a non-core one.
- `pnpm features:removable` type-checks the app once per feature with that feature's folder removed.

## Build

`core/feature.ts` defines the contract:

- identity: `id`, `name`/`description` (message keys), `icon`, `core?`, `dependsOn?`, `requires?`
  (native modules), `defaultEnabled?`, `scope?: 'main' | 'all'` (`all` also starts in the mini player and
  lyrics-overlay windows).
- `contributes`: `routes`, `nav` (sidebar), `panels` (right column), `overlays` (always-mounted),
  `providers`, `slots`, `commands` (palette), `menus` (`root|go|view`), `settings` (sections by category),
  `windows` (`{ [name]: Component }` for `?window=` pages), context-menu entries.
- Slots: `home.top`, `topBar.end`, `topBar.center`, `playerBar.end`, `sidebar.sections`,
  `nowPlaying.header`, `nowPlaying.side` (tabs), `lyrics.toolbar`, `queue.header`, `playlist.header`.
- `start()` runs when the feature becomes active (main window unless `scope: 'all'`) and returns a
  disposer.

`core/registry.ts` (Zustand): reads saved overrides **synchronously** from `localStorage`
(`melodesk.features`) so `active` is right before anything renders, then `load()` merges the SQLite copy
(`features:overrides`) and `native_modules`. Turning a feature on turns on its dependencies; off leaves
others alone but dependents deactivate (`computeActive`). `windowKind()` is `main | mini | lyrics`.

`core/discover.ts` globs `../features/*/index.{ts,tsx}` eagerly (so every window sees every feature
module), skipping `_`-prefixed folders. `core/hooks.ts`: `useFeatureActive`, `useContribution`, `useSlot`,
`useFeatureRoutes`, `useCommands`, `useWindowComponent`. `FeatureRoutes` falls back to `/` if there is a
home route, else the first sidebar entry (so the app still opens when Home is off).

Cross-feature services live in `core/services.ts` as tiny registries (`createRegistry`):
`lyricsSources`, `infoSources`, `aiSources`; plus `core/actions.ts` (`registerAction`/`runAction`),
`core/navigation.ts`, `core/levels.ts` (audio-level source stack), `core/lyricsProgress.ts`,
`core/useSourceActive.ts` (`useSyncExternalStore` over `isActive`/`subscribe`).

`_template/` is a copy-paste starting point and is ignored by discovery.

## Acceptance

- `core/architecture.test.ts`, `core/registry.test.ts` pass.
- e2e `features.e2e.ts`: Settings lists optional features, switching one off removes its nav/page and
  back on restores it; turning off the queue turns off queue-tools; a feature takes its settings page with
  it; the palette only offers what is on; the choice survives a reload.

## Known limits

- Features are trusted first-party code. The permissioned plugin SDK (12) is the separate layer for
  integrations.
