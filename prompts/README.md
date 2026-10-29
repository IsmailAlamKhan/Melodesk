# Melodesk build prompts

A complete, ordered set of specifications for **everything Melodesk does today**, written as
prompts: each file can be handed to an engineer or an AI coding agent to build (or rebuild, or audit)
that part from nothing, and says how to know it is right. The code in this repository is the result of
following them; where a prompt and the code disagree, that is a bug in one of them, so fix it.

## How to use

1. Read [`00-charter.md`](00-charter.md) first. Its constraints apply to **every** other prompt and are
   not repeated in each one.
2. Build in numeric order. Each prompt lists what it needs from earlier ones under **Needs**.
3. A prompt is done only when its **Acceptance** section passes. Most acceptance items are tests that
   already exist in the repo (named, so you can find them); the rest say what to check by hand.
4. Anything under **Known limits** was _not_ verified against real hardware, services or platforms. Say
   so in the release notes; never claim it works.
5. [`90-gotchas.md`](90-gotchas.md) lists the mistakes already made once. Read it before touching the
   areas it names.

## Index

| #   | Prompt                                                       | What it covers                                                               |
| --- | ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| 00  | [charter](00-charter.md)                                     | What Melodesk is, the hard rules, the working style                          |
| 01  | [monorepo and tooling](01-monorepo-and-tooling.md)           | Workspace, pinned versions, scripts, lint, i18n                              |
| 02  | [YouTube Music bridge](02-youtube-music-bridge.md)           | The hidden player window, the bridge, the protocol, trust model              |
| 03  | [feature framework](03-feature-framework.md)                 | How the app is assembled from removable features                             |
| 04  | [playback sources](04-playback-sources.md)                   | Backends, routing, the player store, YouTube Music as a switchable feature   |
| 05  | [YouTube Music pages and data](05-youtube-pages-and-data.md) | Adapter, home/search/library/detail, account, health                         |
| 06  | [player UI](06-player-ui.md)                                 | Player bar, queue, Now Playing, lyrics, karaoke, mini player, stats, palette |
| 07  | [video and ads](07-video-and-ads.md)                         | Song/Video switching, the full-window picture, Skip ad                       |
| 08  | [local music](08-local-music.md)                             | Library scan, the local player, lyrics from files, tag editor                |
| 09  | [sound](09-sound.md)                                         | Equalizer, ReplayGain, crossfade, gapless, visuals                           |
| 10  | [playlists and data](10-playlists-and-data.md)               | Import/export, smart playlists, backup/restore, control API                  |
| 11  | [network sources](11-network-sources.md)                     | Subsonic/Navidrome, podcasts, internet radio                                 |
| 12  | [plugins and integrations](12-plugins-and-integrations.md)   | Plugin SDK, lyrics sources, scrobbling, MusicBrainz, local AI                |
| 13  | [small features](13-small-features.md)                       | What's new, floating lyrics, first run, shortcuts, artwork, resume           |
| 14  | [settings sync](14-settings-sync.md)                         | Folders, cloud drives, GitHub, the Melodesk server, encryption, merge        |
| 15  | [sync server](15-sync-server.md)                             | The Vercel + Redis server and how it was deployed                            |
| 16  | [release pipeline](16-release-pipeline.md)                   | CI, release-please, signed builds, updater, version history                  |
| 17  | [testing](17-testing.md)                                     | Test layers, mocks, what CI is the authority for                             |
| 90  | [gotchas](90-gotchas.md)                                     | Mistakes and surprises already hit                                           |
| 91  | [status](91-status.md)                                       | What is built, what is untested, what is open                                |
| 99  | [planned: playback sync](99-planned-playback-sync.md)        | The next feature, fully planned, not built                                   |

## Prompt format

Every prompt has the same sections so they can be checked mechanically (`scripts/check-prompts.mjs`):
**Goal**, **Needs**, **Constraints** (optional; only what is specific to this area), **Build**,
**Acceptance**, **Known limits**. Keep them that way when you add one.
