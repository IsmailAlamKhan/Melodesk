# 91 — Status

State as of **v0.13.3** (released). "Verified" means covered by tests that pass in CI; **none** of it has
been run against the real thing unless it says so.

| Area                                                         | Built                                   | Verified how                                                                                                        | Not verified                                                                                |
| ------------------------------------------------------------ | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| YouTube bridge, pages, adapter                               | yes                                     | unit + fixtures + mocked e2e; **video layout and the Song/Video switch checked on the live page in a browser pane** | the bridge inside the real app window; ads                                                  |
| Playback sources, YouTube off-switch                         | yes                                     | unit (routing) + e2e                                                                                                | real hidden-window teardown on Windows/Linux                                                |
| Local music, tag editor                                      | yes                                     | real SQLite, real tag files, e2e with generated clips                                                               | real audio devices, Ogg/Opus on non-macOS                                                   |
| Sound (EQ, ReplayGain, crossfade, gapless, visuals)          | yes                                     | unit + e2e                                                                                                          | listening to it                                                                             |
| Playlist import/export, backup, smart playlists, control API | yes                                     | unit, e2e, Rust tests                                                                                               | real playlists at scale, a real external client                                             |
| Music server, podcasts, radio                                | yes                                     | mocked network                                                                                                      | real Navidrome/feeds/stations                                                               |
| Plugins (lyrics, scrobble, MusicBrainz, Ollama, Discord)     | yes                                     | fake fetch                                                                                                          | every real service                                                                          |
| What's new, floating lyrics, tips, resume, artwork           | yes                                     | unit + e2e                                                                                                          | the overlay's transparency/always-on-top on any OS                                          |
| Settings sync: folders, cloud folders                        | yes                                     | unit (two computers on real SQLite), Rust, e2e                                                                      | real cloud drives, two real computers                                                       |
| Settings sync: GitHub sign-in                                | yes, **hidden**                         | parsing + fake flow                                                                                                 | needs `MELODESK_GITHUB_CLIENT_ID` (an OAuth app with Device Flow); never run against GitHub |
| Settings sync: Melodesk server (encrypted, full config)      | yes                                     | crypto + engine tests, e2e, the live server answered hand-made requests (health, put, stale put 409, get, head)     | the app talking to the live server end to end; the sync code flow on a second computer      |
| Sync server on Vercel + Upstash                              | **deployed**, `melodesk.ismailalam.com` | live requests, 12 handler tests                                                                                     | load, the free-tier command quota under real use                                            |
| Skip ad                                                      | yes                                     | e2e; selectors read from YouTube's player script                                                                    | **a real ad**                                                                               |
| Video                                                        | yes                                     | e2e; layout and switch tested live                                                                                  | the full path in the installed app (owner to confirm)                                       |
| Release pipeline                                             | yes                                     | 14 releases published                                                                                               | notarization, Windows signing                                                               |

## Open items

1. Owner to confirm video and Skip ad in the installed app (v0.13.3).
2. Register a GitHub OAuth app (Device Flow) and set `MELODESK_GITHUB_CLIENT_ID` to show GitHub sign-in.
3. Try Melodesk sync between two real computers; watch the Upstash command count.
4. Playback sync across devices: **planned, not built** ([99](99-planned-playback-sync.md)).
5. Cosmetic: move the YouTube data layer and status fields into `features/youtube-music`.
6. Not done: cue sheets, loudness analysis without ReplayGain, a mixed local/YouTube queue, third-party
   plugin loading, notarized/Windows-signed builds.
