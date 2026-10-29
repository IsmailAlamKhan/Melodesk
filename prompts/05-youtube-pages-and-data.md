# 05 — YouTube Music pages and data

## Goal

Browse YouTube Music inside Melodesk's own UI (home, explore, search, library, artist/album/playlist
pages, account) using the account the user signed in with in the player window, and play from it.

## Needs

02, 03, 04.

## Constraints

- All data comes through the player (prompt 02 `data` command); Melodesk never holds credentials.
- Only `packages/adapter` knows YouTube's response shapes. Parsers are versioned (`parsers/v1`) and
  fixture-tested; a parse failure shows a friendly error, never a crash (`PageCrashed` boundary).
- Every list of tracks/cards uses shared components so context menus and drag-and-drop work everywhere.

## Build

**Adapter** (`packages/adapter/src`): `innertube/endpoints.ts` (the endpoint names and request bodies),
`nav.ts`, `renderers.ts`, `shelves.ts` (shelf/renderer walking); `parsers/v1/{account,browse,
media-session,playlists,queue,search}.ts`; `schemas/{items,track}.ts` (Zod item types: song, album,
artist, playlist, video, podcast, with thumbnails and the navigation endpoint to play/open);
`errors.ts`, `version.ts`. Fixtures in `tests/fixtures` (captured, anonymised responses) with
`fixtures.test.ts`, `playlists.test.ts`, `media-session.test.ts`.

**Data hooks** (`apps/desktop/src/data/`): `innertube.ts` (typed fetchers: home, browse, search, search
suggestions, next/queue, lyrics, library, account, playlists), `hooks.ts` (TanStack Query hooks gated on
the player being `ready`), `persister.ts` (SQLite-backed query cache with `shouldPersistQuery`,
`query-cache` key skipped by backup/sync), `kv.ts` (settings table: `kvGet/kvSet/kvDel`, `onKvChange`),
`queryClient.ts`, `lyricsOverride.ts`.

**Features** (all `dependsOn: ['youtube-music']`): `home` (shelves + `home.top` slot cards + Welcome
sign-in panel while signed out), `browse` (Explore, charts, moods, new releases), `search` (top-bar
combobox with live suggestions and recent searches, `/search` page with filters; top result opening an
artist, one-click rows), `library` (playlists, songs, albums, artists, podcasts, history; sidebar
playlists; create/rename/delete; add-to-playlist dialog), `detail` (artist, album, playlist pages with
sort/view options), `playlist-import` (06/10), `resume` (a "Continue listening" card that restarts the
saved song at its position through the page's own endpoint), `audio-engine` (EQ/loudness for the web
player; not available on macOS and Linux webviews).

**Shell pieces**: `app/Welcome.tsx` (signed-out state: open the player to sign in, or paste a link),
`HealthBanner` (bridge degraded/dead), `OfflineBanner`, `PageCrashed`, `Layout`, `Sidebar`/`BottomNav`
(narrow windows), `components/` (ItemCard, ItemRow, ShelfView, PageHeaderView, EditableTrackList,
ItemMenu, ArtistLinks, Marquee, BeatRing…). Account section (settings → General) lives in the
youtube-music feature.

`player/actions.ts` turns a clicked item into the right command (`playItem`, `playEndpoint`,
`routeForEndpoint`), `player/links.ts` converts music.youtube.com links to in-app navigation,
`player/like.ts` sets like status, `player/nextInfo.ts` finds the next track's text for lyrics lookup.

## Acceptance

- Adapter fixture tests pass. e2e `browse.e2e.ts`: search shows results; a result row plays or opens with
  one click anywhere on it; a top result that is an artist opens the artist; the artist in the player bar
  opens the artist page; the queue panel lists the page queue and double-click jumps; **no unexpected
  backend calls** (the mock records unhandled commands and the test asserts none).
- e2e `home-cards`, `recent-searches`, `now-playing`, `offline`, `page-crash`, `player-health`,
  `responsive`, `settings` for their areas.

## Known limits

- Parsers track YouTube's current markup; changes break them silently until health reports it.
