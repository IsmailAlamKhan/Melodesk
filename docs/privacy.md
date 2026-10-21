# What Melodesk sends, and where

Melodesk has no accounts, no analytics and no crash reporting. This page lists every connection the
app can make, so you can check it against what you see in a network monitor. If you find one that is
not here, that is a bug: please open an issue.

## Always

| To                                                                         | What                                                                                      | Why                                                                                                                                                           |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `music.youtube.com` (inside the player window)                             | Everything YouTube Music's own web app does: playback, your account's feed, search, likes | Melodesk is a window around the official web player. Sign-in happens on Google's own page inside that window, and the app never sees your password or cookies |
| `i.ytimg.com`, `*.googleusercontent.com`, `*.ggpht.com`, `www.gstatic.com` | Requests for cover art, sent without a `Referer`                                          | Showing covers. A copy is kept on your computer so they show offline                                                                                          |
| `github.com/melodesk/melodesk`                                             | A request for the update manifest (`latest.json`)                                         | Checking for a new version, only when you press "Check for updates"                                                                                           |

## Only if you turn it on

Everything below is off until you switch it on, and each one says in Settings what it sends.

| Feature                           | To                                    | What                                                                                                                            |
| --------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Plugin **LRCLIB lyrics**          | `lrclib.net`                          | Track title, artist, album and length                                                                                           |
| Plugin **NetEase lyrics**         | `music.163.com`                       | Track title and artist                                                                                                          |
| Plugin **lyrics.ovh**             | `api.lyrics.ovh`                      | Track title and artist                                                                                                          |
| Plugin **Last.fm**                | `ws.audioscrobbler.com`               | What you play (title, artist, album) and your Last.fm key, to scrobble                                                          |
| Plugin **ListenBrainz**           | `api.listenbrainz.org`                | What you play and your token, to submit listens                                                                                 |
| Plugin **Discord Rich Presence**  | Discord, on this computer             | The track you are playing, shown in your Discord status                                                                         |
| Plugin **Local AI song finder**   | `localhost` (Ollama on this computer) | Track title and uploader. Nothing leaves your machine                                                                           |
| Lyrics translation (**MyMemory**) | `api.mymemory.translated.net`         | The lyric text. The app asks before the first use. The alternative, a LibreTranslate server on this computer, sends nothing out |

## Stays on this computer

- **Listening history and stats** are written to a local SQLite database and never uploaded. The
  Stats page and its "copy a summary" button only use that database.
- **Settings, the saved place for "Continue listening", your recent searches, your corrections to
  lyrics lookups** and the offline cover cache are local files, in the app's data folder. Recent
  searches can be cleared from the search box. Lyrics that were found are kept for a day, so
  they show again (even offline) without asking the source again.
- The **colours of a page** are worked out from its artwork on your computer.

## What the code does not do

It does not read your cookies, passwords or tokens; it does not extract or download streams; it
does not block ads; it does not phone home. The rules that keep it that way are in
[CONTRIBUTING.md](../CONTRIBUTING.md), and plugins can only reach the hosts listed in their manifest
(see [plugins.md](plugins.md)).

## Checking for yourself

On macOS, `nettop -m tcp -p Melodesk` or a tool like Little Snitch shows the connections; on Windows
and Linux, Wireshark or `ss -tp` does. With no plugin on and nothing playing you should see YouTube
Music's own traffic and nothing else.
