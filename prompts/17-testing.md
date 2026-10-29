# 17 — Testing

## Goal

Know that a change works without needing real YouTube, hardware or other computers, and know exactly what
that does **not** prove.

## Needs

1.

## Build

**Layers**

1. **Unit** (Vitest, in each package and `apps/desktop/src/**.test.ts`): pure logic. Real SQL is run
   against **`node:sqlite`** loaded with the actual migrations (`library`, `smart`, `backup`,
   `settings-sync/engine`, `stats`), never against a hand-written fake.
2. **Rust** (`cargo test --no-default-features --features discord,shortcuts`): command validation, path
   confinement, net allow-lists, control API routing, sync/cloud/github/server parsing, git-free file IO,
   tag writing on real files (including WAV), id/ReplayGain parsing.
3. **End-to-end** (Playwright against the built UI, `apps/desktop/e2e`): `mock-tauri.ts` replaces
   Tauri's IPC in the page. Helpers: `installTauri(page, options)`, `emit(page, event)` (a player bridge
   event), `startPlayback`, `sentCommands`, `TRACK`; `settings-nav.ts`. Options: `local` (files, pickFolder,
   art, sidecars, clipSeconds), `importFile`, `server`, `web`, `sync` (`folder`, `file`, `git`, `clouds`,
   `github`, `server`), `appVersion`, `kv` (initial settings), `youtubeLyrics`, `lrclib`, `http`, `sql`,
   `nativeModules`. The mock keeps settings in `localStorage` with their `updated_at`, runs library SQL in
   the test process via `node:sqlite`, records unhandled IPC (`browse.e2e` asserts none).
4. **Accessibility**: axe audits inside e2e (`a11y.e2e.ts` and per-page checks).
5. **Architecture**: `core/architecture.test.ts` (feature boundaries), `features:removable`.

**Conventions**: the app uses a memory router, so tests never assert URLs (assert sent commands or page
content); settings switches are named "<Title> <description>" (match with `^Title [A-Z]`); use
`getByRole` scoped to a dialog when names repeat (strict mode); wait with `expect.poll` on
`sentCommands`; race-free events: the player listener is attached at module load, so `emit` right after
`goto` works.

**CI is the authority.** Locally run only what you touched (`vitest run <path>`, `playwright test <file>`,
`cargo test <name>`); the full matrix is slow on a loaded machine. Rustfmt after Rust edits
(`rustfmt --edition 2021 <file>` or `pnpm fmt:rust`). Playwright browsers may need
`playwright install chromium`.

## Acceptance

- Each prompt's Acceptance list is satisfied by tests that exist and pass in CI.

## Known limits

- None of this exercises real audio output, a signed-in YouTube page, a real ad, real network services,
  Windows or Linux in use, or two real computers. Statements about those must say "not tested".
