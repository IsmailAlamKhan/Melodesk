# 13 — Smaller features

## Goal

The features that are small but specified: What's new, the floating lyrics window, getting-started tips,
offline artwork, resume.

## Needs

03, 06.

## Build

**What's new** (`features/whats-new`):

- `releases.ts`: `RELEASES` newest first, each `{version, highlights: MessageKey[]}`, text in `en.json`
  as `whatsNew.v<major>_<minor>_<patch>.<a,b,…>`. **The version must be the version that actually ships**
  (release-please decides it from commit types: `feat` → minor, `fix` → patch); a mislabeled entry never
  reaches the people it is for.
- `logic.ts`: `parseVersion`, `compareVersions` (numeric), `releasesSince(releases, seen, current)`,
  `releasesUpTo`.
- `AutoOpen` (overlay): reads the running version (`getVersion`) and kv `whats-new:seen`. Same → nothing.
  Older → show what came since, then record it **first** (a window that was shown is not shown again).
  Missing: a **fresh install** (no `first-run:dismissed`, no history rows) just records the version;
  anyone else is treated as having last run `0.7.0` (the version before this window existed) and sees
  what came since.
- `WhatsNewDialog` (overlay), `store.ts`, a palette command, a View-menu entry, and a **Settings → About**
  section with a "Show what's new" button.

**Floating lyrics** (`features/lyrics-overlay`, depends on lyrics, `scope: 'all'`): Rust
`open_lyrics_overlay` (transparent, always-on-top, undecorated, resizable, label `lyrics-overlay`, URL
`index.html?window=lyrics`; listed in `capabilities/main.json` `windows`). The **main window** feeds it:
`OverlayEmitter` (only while open) uses `useTrackLyrics` + `usePositionMs` and emits
`lyrics-overlay:line` `{title, artist, line, next, timed, hasLyrics}` when it changes; the overlay asks
for the current line with `lyrics-overlay:request` on open and tells the main window it closed with
`lyrics-overlay:closed` (`onCloseRequested`). Untimed lyrics cannot follow the music, so no line is
claimed. `main.tsx` generalizes `?window=` to `mini | lyrics`; `styles.css` makes both transparent.

**First run** (`first-run`): a Home card with four tips until dismissed (kv `first-run:dismissed`).
**Offline artwork** (`offline-artwork`): caches covers (`cache.ts`) for when the network copy fails;
requests carry no Referer. **Resume** (`resume`): a recorder saves `{videoId, position, endpoint}`
(kv `resume:last`, skipped by backup/sync); the Home card restarts it through the page's endpoint and
seeks after the song loads (7 s retry, 20 s seek wait).

## Acceptance

- `whats-new/logic.test.ts` (numeric compare, windows, the list is newest-first with a message for every
  highlight), `lyrics-overlay/protocol.test.ts`, `offline-artwork/cache.test.ts`, `resume/saved.test.ts`.
- e2e `whats-new.e2e.ts` (after an update shown once; fresh install quiet and the whole list from the
  palette; existing user without a saved version sees what came since; Settings → About button),
  `artwork.e2e.ts`, `home-cards.e2e.ts`.

## Known limits

- The floating lyrics window is compiled and unit-tested but its transparency and always-on-top
  behaviour have not been seen on any OS from this environment.
