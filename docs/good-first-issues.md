# Good first issues

Starting points for contributors, each with where to look. Open an issue with the
`good first issue` label for any you plan to take so two people don't pick the same one.
Sizes are rough: **S** is an evening, **M** a weekend.

## Needs no special hardware

- **Translate Melodesk into your language (S).** `pnpm i18n:new fr` creates `locales/fr.json` to
  translate; see [translating.md](translating.md). Check with `pnpm i18n:check`.
- **More end-to-end coverage (S–M).** `apps/desktop/e2e` covers most screens, features, Settings,
  plugins, lyrics lookup, the visualizer, shortcuts and an accessibility audit. Missing: the playlist
  create/rename/delete dialogs, the Library sub-pages, and the mini player (`/?window=mini`). Each
  needs a few commands added to `e2e/mock-tauri.ts`.
- **More lyrics sources (S–M).** A lyrics source is a plugin with `provides: ['lyrics']` (see
  `packages/plugins/src/plugins/netease.ts` and [plugins.md](plugins.md)). Good candidates are free,
  public APIs with timed lyrics. Match carefully: wrong lyrics are worse than none.
- **Better guesses for covers (S).** `packages/plugins/src/candidates.ts` turns titles like
  "Song | Film | Uploader" into guesses of the real song. Add titles that fool it as test cases
  (`tests/candidates.test.ts`) and teach it, for example more tag words in other languages.
- **Teach the local AI prompt (S).** `packages/plugins/src/plugins/ollama.ts` asks a small model which
  song a track is. Try other small models, tighten the prompt, and add what works to the plugin's hint.
- **A new music visual (S).** `features/visualizer/VisualizerTab.tsx` draws bars, a wave and a ring
  from `core/levels.ts`; add another mode, or a better simulated rhythm in `simulated.ts`.
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

- **Real audio levels for the visuals (M).** On Windows an `AnalyserNode` on the player's element
  should give real levels; on macOS and Linux it would take a native audio tap. See "Music visuals" in
  [architecture.md](architecture.md) and `setLevelSource` in `core/levels.ts`.
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
