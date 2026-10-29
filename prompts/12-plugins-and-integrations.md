# 12 — Plugins and integrations

## Goal

Optional integrations (lyrics sources, scrobbling, song facts, a local AI helper, Discord presence) as
**opt-in plugins with declared permissions**, plus the features built on them.

## Needs

03, 06.

## Constraints

- Every plugin is **off by default** (`enabledByDefault: false`) and its settings card says exactly what it
  sends and where.
- A plugin can only fetch hosts in its manifest `hosts`, over https (plain http only to `localhost` /
  `127.0.0.1`, for Ollama); those hosts must **also** be in `capabilities/main.json` → `http:default`
  (`features/integrations/capabilities.test.ts` enforces this).
- Only first-party plugins are loaded (no dynamic imports, no eval). The SDK and permissions are what a
  sandboxed loader would sit behind.

## Build

**SDK** (`packages/plugins/src`): `manifest.ts` (Zod: `id, name, version, description, permissions[],
hosts[], linkHosts[], provides[] = lyrics|identify|explain|info, enabledByDefault`; permissions
`network:fetch storage:plugin playback:read playback:control open:link notifications native:discord`),
`sdk.ts` (`definePlugin({manifest, settingsFields, setup(ctx)})`; `ctx` has only what the permissions
allow: `fetch`, `storage`, `player`, `control`, `openLink`, `notify`, `native`, `settings`, `log`;
instance methods `lyricsProvider`, `identifySong`, `explainLyric`, `songInfo`, `newReleases`,
`suggestRules`, `status`, `actions`, `dispose`), `candidates.ts` (`cleanTitle`, `plainName`,
`lyricsCandidates`, `pickLrclib`), `lrc.ts` (timed-lyrics parser), `scrobble.ts`.

**Host** (`features/integrations/host.ts`): `usePluginHost` (records, enabled flags in kv
`plugin:<id>:enabled`, settings `plugin:<id>:settings`, storage `plugin:<id>:store:*`), builds each
`PluginContext`, `startPluginHost` (status timer every 2 s), `lyricsFromPlugins` (guesses: the user's own
answer, what the player reports, cleaned titles, AI guesses; every enabled provider asked at once, 14 s
budget each, identify 30 s; best answer wins), `explainLyric`, `canExplainLyrics`, `isInfoProviderOn`,
`songInfoFromPlugins` (25 s), `newReleasesFromPlugins` (180 s), `canSuggestRules`/`suggestRulesFromPlugins`
(60 s), `enablePlugin`. `PluginsSection` groups plugins (lyrics, song facts, identify, activity).
Registered into core registries: `lyricsSources` (LRCLIB entry with `activate`, `signature`, `ready`,
`canExplain`), `infoSources` (MusicBrainz), `aiSources` (Ollama).

**First-party plugins**: `lrclib`, `netease`, `lyricsovh` (lyrics); `ollama` (identify the real song for
covers/remixes, explain a lyric line, `suggestRules`; localhost only; model default `llama3.2:3b`; JSON
mode; cached 90 days); `musicbrainz` (`info`: `songInfo(track)` and `newReleases(artists, days)`; host
`musicbrainz.org`; User-Agent `Melodesk (https://github.com/IsmailAlamKhan/Melodesk)`; one request at a
time, ≥1.1 s apart; recording search quoted and escaped; 30-day cache); `lastfm`, `listenbrainz`
(scrobbling, tokens kept in plugin settings, removed from backups); `discord` (native module, rich
presence, off in builds without the `discord` feature).

**Features on top**:

- `song-info` (Now Playing tab "Song info"; asks before anything is sent; shows release date, album,
  genres, artist country/kind/years active, links to MusicBrainz).
- `release-radar` (Home card "New from artists you play": top artists from `history` over 180 days,
  `newReleases(artists, 60)`, cached a week in kv `radar:cache`, dismissible, opt-in card first).
- AI smart playlists: the smart-playlist editor (10) shows "Describe it in words" when an `aiSources`
  entry is active; the model gets a fixed field list (`buildRulesPrompt`), replies JSON,
  `parseJsonObject` → `rulesFromAi` whitelists/clamps; the user reviews before saving.
- Lyrics explanations and results are cached in kv and shown in the progress list.

## Acceptance

- `packages/plugins/tests`: `sdk.test.ts`, `candidates.test.ts` (cleaning, candidates, prompts,
  `parseJsonObject`), `musicbrainz.test.ts` (query escaping, recording picking, date windows, full plugin
  run with a fake fetch: User-Agent, spacing, caching, only releases in the window).
- e2e: `plugins.e2e.ts`, `lyrics-sources.e2e.ts`, `lyrics-lookup.e2e.ts`, `lyrics-explain.e2e.ts`,
  `ai-info.e2e.ts` (song info asks first then shows facts; radar offers itself then lists releases;
  a smart playlist is filled from a description).

## Known limits

- **Never run against real MusicBrainz, Last.fm, ListenBrainz, LRCLIB, NetEase or Ollama**; fakes only.
- MusicBrainz data is community data and can be wrong or missing.
