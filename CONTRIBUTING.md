# Contributing to Melodesk

Thanks for helping. A few rules keep the project legal-safe and maintainable.

## Hard constraints (pull requests that break these are closed)

1. Playback, authentication, and ads go through the official music.youtube.com web player.
   No stream URL extraction, signature deciphering, PO-token bypass, media download, or ad
   blocking in the core app.
2. Our code never reads, stores, or logs credentials, cookies, or tokens.
3. No YouTube or YouTube Music name, logo, or icon as Melodesk's identity.
4. No telemetry by default.

## Setup

```bash
pnpm install
pnpm dev
```

## Project layout

| Path               | What lives there                                                  |
| ------------------ | ----------------------------------------------------------------- |
| `apps/desktop`     | Tauri app: Rust shell (`src-tauri`) and the React UI (`src`)      |
| `packages/bridge`  | The script injected into the player webview + the typed protocol  |
| `packages/adapter` | Parsers and selectors for YouTube's responses (versioned, tested) |
| `packages/ui`      | Design tokens and React components                                |
| `packages/plugins` | Plugin SDK and first-party plugins                                |
| `docs`             | Architecture, adding features, plugin guide                       |

### Adding a feature

New UI belongs in a feature folder: `apps/desktop/src/features/<id>/`. Copy `features/_template`,
and read [docs/extending.md](docs/extending.md) for what a feature can add, how features may (and may
not) depend on each other, and how to make part of it optional. `pnpm features:removable` checks that
every feature folder can be deleted without breaking the build.

### Accessibility

`e2e/a11y.e2e.ts` runs axe (WCAG 2.1 A and AA) over the main screens in the dark and light themes and
at phone width, and fails on any violation. New screens should get a few lines there. In short: give
every control a name, keep lists and tables in their real roles (a `row` needs `cell`s), do not nest
buttons in options, and keep text readable in both themes.

## Before you push

```bash
pnpm typecheck && pnpm test && pnpm test:e2e && pnpm lint && pnpm clippy && pnpm fmt:rust
```

## End-to-end tests

`apps/desktop/e2e` runs the real UI in headless Chromium. `mock-tauri.ts` stands in for Tauri's IPC
and answers InnerTube calls from `packages/adapter/tests/fixtures`; tests push bridge events with
`emit()` and read what the UI sent with `sentCommands()`. If a new feature calls a backend command
the mock doesn't know, the "no unexpected backend calls" test fails: add the command to the mock
deliberately. Every cover is replaced by a generated gradient, so tests never touch the network.
Specs are `*.e2e.ts`; `*.shots.ts` files regenerate the README screenshots (`pnpm screenshots`).

## Changing colours or the default accent

Colours come from a generated Material scheme (see docs/architecture.md). If you change the generator
or the default seed in `appearance/material.ts`, regenerate the default values in `tokens.css`:

```bash
UPDATE_TOKENS=1 pnpm --filter @melodesk/desktop exec vitest run src/appearance/tokens.generate
```

and run `pnpm test`: the contrast tests fail if any text pairing stops meeting WCAG AA.

## When YouTube changes something

Selectors live in `packages/bridge/src/inject/selectors.vN.ts` and parsers in
`packages/adapter/src/parsers/vN/`. Add a new version rather than editing the old one in place
when the change is incompatible, save a fixture under `packages/adapter/tests/fixtures/`, and
make sure the health check reports the breakage you are fixing.

## Translations

See [docs/translating.md](docs/translating.md). New UI text goes into `apps/desktop/src/i18n/locales/en.json`
and is used through `t('key')`; `pnpm i18n:check` runs in CI.

## Commits

Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:` …). Releases are cut by release-please
from these messages.
