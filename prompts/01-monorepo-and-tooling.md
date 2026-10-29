# 01 — Monorepo and tooling

## Goal

A pnpm workspace that builds the desktop app and the packages it uses, with fast local checks and a CI
that is the final authority.

## Needs

0.

## Constraints

- pnpm 10 workspace (`pnpm-workspace.yaml`: `apps/*`, `packages/*`), Node 22+ (`engines`).
- TypeScript 5.9, all packages extend `tsconfig.base.json`: `strict`, `noUncheckedIndexedAccess`,
  `exactOptionalPropertyTypes`, `noUnusedLocals/Parameters`, `verbatimModuleSyntax`, `isolatedModules`,
  `moduleResolution: bundler`.
- ESLint (typescript-eslint strict + stylistic, react-hooks) and Prettier. Rules that bite: prefer `??`,
  no `import()` types (use `import type`), `consistent-type-definitions: interface`,
  react-hooks "no setState in effect" and "no hook inside a callback / short-circuit" (use
  `useSyncExternalStore`, call hooks unconditionally), `no-base-to-string`, no unnecessary conditions.

## Build

Packages:

| Package            | Role                                                                                                                                                           |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/desktop`     | Tauri shell (`src-tauri`) + React app (`src`) + Playwright e2e (`e2e`)                                                                                         |
| `apps/sync-server` | The optional sync server for Vercel (prompt 15)                                                                                                                |
| `packages/bridge`  | `protocol.ts` (Zod schemas shared with the UI) and `inject/` (the script that runs in the player webview, bundled to one IIFE and embedded in the Rust binary) |
| `packages/adapter` | Versioned parsers for YouTube's responses, fixture-tested                                                                                                      |
| `packages/plugins` | Plugin SDK and the first-party plugins                                                                                                                         |
| `packages/ui`      | Design tokens and React components (`Button`, `IconButton`, `Dialog`, `Slider`, `Tooltip`, `Skeleton`, `inputClass`, `cn`)                                     |

Root scripts (`package.json`): `dev`, `build`, `build:bridge`, `typecheck`, `lint`, `test`, `test:e2e`,
`clippy` (bare and with `discord,shortcuts` features, `-D warnings`), `test:rust`, `fmt:rust`
(`scripts/fmt-rust.mjs`, cross-platform), `features:removable`, `i18n:check`, `check` (all of them).
Optional native modules are Cargo features (`discord`, `shortcuts`); the UI asks `native_modules` and
turns off features that need a missing one.

Stack versions at the time of writing: Tauri `=2.12.4`, tauri-plugin-sql/store/notification/opener/os/
process/http/dialog/fs/global-shortcut/autostart/deep-link/single-instance/updater (all `=` pinned),
React 19, Vite, Zustand, TanStack Query (with a SQLite persister), React Router (memory router),
Radix primitives, framer-motion, dnd-kit, lucide-react, Zod 4, Vitest 5, Playwright. Rust: `lofty`
(tags), `walkdir`, `url`, `serde`, `thiserror`, `anyhow`, `keyring` (macOS/Windows keychain).

i18n: one `en.json`, typed `MessageKey`s, `{param}` interpolation, plural suffixes, pseudo-locales for
testing; `scripts/i18n-check.mjs` verifies keys. New user-facing text always gets a key.

## Acceptance

- `pnpm install --frozen-lockfile && pnpm check` is green on a clean checkout.
- `pnpm lint` has zero errors (warnings tolerated).

## Known limits

- Local `pnpm check` is slow on a loaded machine; CI (macOS, Windows, Linux) is the authority.
