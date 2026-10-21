# Good first issues

Starting points for contributors, each with where to look. Open an issue with the
`good first issue` label for any you plan to take so two people don't pick the same one.
Sizes are rough: **S** is an evening, **M** a weekend.

## Needs no special hardware

- **Translate Melodesk into your language (S).** `pnpm i18n:new fr` creates `locales/fr.json` to
  translate; see [translating.md](translating.md). Check with `pnpm i18n:check`.
- **More end-to-end coverage (S–M).** `apps/desktop/e2e` has home, search, queue, player bar,
  karaoke and offline covers. Missing: the playlist create/rename/delete dialogs, the Library pages,
  Settings toggles, the command palette, and the mini player (`/?window=mini`). Each needs a few
  commands added to `e2e/mock-tauri.ts`.
- **Accessibility pass with axe (S).** Add `@axe-core/playwright` to the e2e suite, fix what it
  finds on Home, Settings and karaoke, and keep it in CI.
- **Cache the playing track's cover first (S).** `artwork/cache.ts` queues covers first come, first
  served, so the current track's cover can wait behind a whole shelf. Add a priority path for the
  player bar and queue.
- **Enhanced-LRC word timing (M).** `packages/plugins/src/lrc.ts` parses line timings only. If a
  lyric file carries per-word `<mm:ss.xx>` tags, parse them and let `lyrics/karaoke.ts` use the real
  word times instead of estimating them.
- **More screenshots (S).** Add RTL, AMOLED and compact density to `e2e/screenshots.shots.ts`
  and show them in the README.
- **Plural forms for more languages (S).** `i18n/index.ts` selects plural categories with
  `Intl.PluralRules`; add tests for Arabic and Polish message sets.

## Needs Windows or Linux

- **Verify the equalizer on Windows (M).** Run `VITE_AUDIO_SELFTEST=1 pnpm dev` on Windows and read
  the bridge log (`audio:` lines). If the signal is real, build the Settings UI (ten sliders,
  presets from `audio/presets.ts`, a leveling switch, an "unavailable" notice driven by
  `usePlayerStore().audio`). If it is silent there too, say so in `docs/architecture.md` and remove
  `packages/bridge/src/inject/audio.ts`.
- **Walk the native checklist on Windows and Linux (M).** Global shortcuts, tray, close-to-tray,
  notifications, media keys and deep links are only compiled in CI there. File what is broken.
- **Measure idle memory and startup on Windows and Linux (S).** Method in
  [performance.md](performance.md); add your numbers.

## Bigger, but well scoped

- **Native account switching (M).** `account/accounts_list` returns nothing for most accounts and
  "Switch account" just shows the player window. Work out what the page does when you switch and
  drive that from our UI.
- **Check the opt-in plugins against real accounts (S–M).** Last.fm, ListenBrainz and Discord
  presence are built and unit-tested, never run with live credentials. See
  [plugins.md](plugins.md).
