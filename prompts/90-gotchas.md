# 90 — Gotchas

Things already hit once. Read before touching the area named.

## Build and tooling

- `rust-ini` 0.21.3 broke the Linux build: pinned to 0.21.1.
- Windows does not expand globs in `fmt:rust`: use `scripts/fmt-rust.mjs`.
- macOS universal builds need **both** Rust targets installed; an empty `APPLE_SIGNING_IDENTITY` fails the
  build (export only when set; else `-`).
- **Never run `pnpm features:removable` while committing or editing**: it moves feature folders away and
  back; a commit made then recorded deletions (caught before pushing). Kill it, restore from git.
- macOS has BSD `sed` (`sed -i ''`) and no `timeout`; python for multi-line edits, and **prettier or
  rustfmt may reformat a line after you edit it, so a later exact-string replace can miss**; re-read.
- The external development drive can disconnect mid-run (`EACCES … /Volumes/…`, "working directory was
  deleted"): check the tree and the last command's effect before continuing.
- Several lint rules fail CI only: a function named `useX` that is not a hook, hooks behind `&&`,
  `setState` in an effect, `import()` types, `type` where `interface` is expected, `[...string]`,
  `??` vs ternary, `init?.body` stringification. Run `eslint` on touched files before pushing.

## Player and YouTube

- `freezePrototype: true` blanks the remote webview. Keep it false.
- `SET_PLAYER_AUDIO_ONLY` / `SET_PLAYER_PAGE_INFO` dispatches do nothing on the real page; press the
  page's own Song/Video buttons. The player page's `will-change: transform` makes it the frame of fixed
  descendants (picture offset/clipped); page menus sit above unless the page itself is fixed over the window.
- `offsetParent` is null for fixed-position elements: use `getClientRects()` to test visibility.
- The ad Skip button lives in a **detached** container outside `#movie_player`.
- Listening for bridge events must start at module load (before features start), or an e2e `emit` right
  after `goto` is lost.
- Hooks must be called unconditionally (a short-circuited `useFeatureActive` crashed the whole layout:
  React error #300).

## Features and UI

- A feature that imports another needs `dependsOn`; a core feature cannot depend on a non-core one.
- Module-level code that reads `window` breaks the node-run architecture test (guard with `typeof window`).
- What's new: the entry's version must match the real release version; a first-run check that only
  recorded the version silently skipped everyone who already used the app (fixed with a baseline).
- Settings sync: applying remote values must keep their `updated_at`, or they bounce forever; plugin
  secrets must survive an incoming overwrite; the encrypted mode alone may carry the music server.

## Sync server and deployment

- Vercel runs native ESM: relative imports need `.js`. With a Root Directory set, deploy from the repo root.
  Without an output directory a static-less project fails ("No Output Directory named public").
- Every push built the project from the wrong folder until Root Directory and the Ignored Build Step were
  set (red "Error" deployments while the last good one kept serving).
- The Upstash marketplace install needs its terms accepted **in the browser** once, defaults
  `autoUpgrade=true` (turn off), and drops `.agents/`, `.claude/`, `skills-lock.json` into the working
  folder: delete them, they are not part of the project.
- Watching CI: watch the run for your commit's SHA; the release PR's run is `action_required`.
- A brand-new DNS name can be stuck as "does not exist" in an ISP resolver (and so through Tailscale,
  which forwards to it) for about an hour. Public resolvers answer correctly; test with `dig @1.1.1.1`
  and `curl --resolve` before concluding the server is down.

## Process

- Do not claim what was not run. Real audio, real servers, real ads, real second computers, Windows and
  Linux have all been untested from the development environment.
- Secrets: never ask for or paste tokens in chat; `gh secret set` and workflow-permission changes are
  done by the owner. OAuth/CLI logins use the device-code flow where the owner approves in a browser.
