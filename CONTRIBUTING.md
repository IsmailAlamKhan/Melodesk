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
| `docs`             | Architecture, this guide's longer form, plugin guide              |

## Before you push

```bash
pnpm typecheck && pnpm test && pnpm lint && pnpm clippy && pnpm fmt:rust
```

## When YouTube changes something

Selectors live in `packages/bridge/src/inject/selectors.vN.ts` and parsers in
`packages/adapter/src/parsers/vN/`. Add a new version rather than editing the old one in place
when the change is incompatible, save a fixture under `packages/adapter/tests/fixtures/`, and
make sure the health check reports the breakage you are fixing.

## Commits

Conventional Commits (`feat:`, `fix:`, `docs:`, `chore:` …). Releases are cut by release-please
from these messages.
