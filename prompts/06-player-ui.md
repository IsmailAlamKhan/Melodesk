# 06 — Player UI

## Goal

The persistent player and the views around it, identical for every source.

## Needs

03, 04.

## Constraints

- Reads only the generic player store; source-specific controls (like, video, Skip ad) show only when
  the playing source offers them (`source === 'youtube'` today).
- Accessible: `axe` audits (light, dark, phone width, command palette, shortcuts, queue, Now Playing) have
  no violations (`a11y.e2e.ts`).

## Build

- **PlayerBar** (`app/PlayerBar.tsx`): artwork (opens Now Playing on narrow windows), marquee title,
  artist links, like/unlike (YouTube), transport, shuffle/repeat, position slider with time labels
  (`usePositionMs` interpolates between samples), volume (`useVolume`), **Skip ad** (under the artist while
  an ad plays; disabled until the page offers its Skip button), **video button** (wide windows; disabled
  with the label "This song has no video" when the page says so), `playerBar.end` slot.
- **Queue** feature: panel with drag-and-drop reorder, remove, jump; `queue-tools` (remove duplicates, save
  as playlist, sleep timer, playback speed).
- **Now Playing** (`now-playing`): full-screen view with tabs from `nowPlaying.side` (Lyrics, Visualizer,
  Song info…), backdrop that breathes with the music.
- **Lyrics** (`lyrics`): panel and Now Playing tab. Sources: the page's own lyrics, then enabled lyrics
  plugins (12), saved sidecar/embedded lyrics for local songs. Timed lines with active-line scroll,
  romanization, translation (MyMemory, asks first), timing offset, "look up another song" box, per-line
  actions (explain with the local AI, copy, copy as picture), a live "where it is looking" progress list,
  and lyrics/AI explanations **kept on this computer** (survive leaving the page and restarts).
- **Karaoke** (`karaoke`, depends on lyrics): full-screen sing-along, word fill timed by spreading each
  line over its words.
- **Mini player** (`mini-player`, scope all): always-on-top window (`?window=mini`), compact or artwork
  mode, mirrors the main window's store.
- **Stats** (`stats`): history recorded by a recorder (a play counts at 30 s or half the song), top
  songs/artists, day/hour charts, recap with streaks and comparison to the previous period.
- **Command palette** (`command-palette`, Cmd/Ctrl+K): commands from every feature plus search
  suggestions. **Keyboard** (`keyboard`): Space/arrow keys, `?` cheat sheet. **Global shortcuts**
  (native module): user-chosen, none by default. **Context menus** (`context-menu`): items, text, links,
  the player and the page.
- **Visualizer** (`visualizer`): Now Playing tab and glows/bars; real levels for local audio via the
  level-source stack, **simulated** for YouTube on macOS/Linux.
- `Img` component retries images and counts blob URLs as CORS-capable; **offline-artwork** keeps covers.

## Acceptance

- e2e: `now-playing`, `lyrics-cache`, `lyrics-explain`, `lyrics-progress`, `lyrics-lookup`,
  `lyrics-sources`, `karaoke`, `stats`, `visualizer`, `volume`, `keyboard`, `shortcuts`, `marquee`,
  `tooltips`, `context-menu`, `a11y`, `skip-ad`, `video`.
- Volume slider moves volume; "Play next" does not start the song; "Continue listening" starts the
  correct song (all were bugs fixed once).

## Known limits

- YouTube's audio levels are not available to the app on macOS/Linux, so visuals are simulated there.
