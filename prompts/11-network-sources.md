# 11 — Network sources: music server, podcasts, radio

## Goal

Play from a Subsonic-compatible server (Navidrome, Airsonic, Gonic…), podcast feeds and internet radio
through the same local player (so EQ, crossfade, queue, shortcuts work).

## Needs

8.

## Constraints

- The webview's CSP cannot name a user's own server. Fetching therefore goes through Rust
  (`src-tauri/src/net.rs`), and **only to hosts the user added**: the UI sends the allow list
  (`net_allow`, from `src/net/allow.ts`, union per source), Rust fetches only those (`net_text`
  ≤ 5 MB, `net_bytes` ≤ 400 MB). `http`/`https` only; no credentials in URLs; redirects are refused
  except for podcast **episodes**, which may redirect to any public https address (`is_public_https`).
- `radio_open` starts a loopback relay on `127.0.0.1` for endless streams; CSP `media-src` allows
  `http://127.0.0.1:*`.
- Passwords stay on the computer (kv `server:config`; synced only through the encrypted option in 14).

## Build

- **Server** (`features/server`, depends on local-music): `md5.ts` (own implementation, RFC vectors),
  `subsonic.ts` (token auth `t = md5(password+salt)`, `ping`, `getArtists`, `getAlbum`, `getAlbumList2`,
  `search3`, `stream`/`getCoverArt` URLs, mapping to `RemoteSong`), `config.ts` (load/save, allow host
  before saving; on a failed connect the previous allow list is restored), `ServerPage` (connect form that
  pings before saving, artists/albums/songs, play).
- **Podcasts** (`features/podcasts`): `rss.ts` (RSS 2.0 + iTunes tags, durations, guid, enclosure,
  `<itunes:image>`), `store.ts` (kv `podcasts:feeds`, directory search via the iTunes API, subscribe by
  address or search), `PodcastsPage` (grid, show page, play latest, episode rows). Positions remembered by
  resume key (`resume:ep:<key>`).
- **Radio** (`features/radio`): `stations.ts` (kv `radio:stations`, radio-browser.info directory),
  `RadioPage` (add by address or search, play via `radio_open`).
- `remote.ts` builds `LocalTrack`s with `source: { url, mime, openRedirects, resumeKey, coverUrl }`.

## Acceptance

- Unit: `md5.test.ts`, `subsonic.test.ts` (12), `rss.test.ts` (7), `stations.test.ts` (6). Rust `net`
  tests (host allow rules, open-redirect policy, loopback relay).
- e2e `server.e2e.ts` (3) and `network-sources.e2e.ts` (5, with an a11y audit) against mocked
  `net_*` commands.

## Known limits

- **Never run against a real Subsonic/Navidrome server, real feeds or real stations.**
