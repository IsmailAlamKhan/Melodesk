# Music servers, podcasts and radio

Besides YouTube Music and the files on your computer, Melodesk can play music from places you add
yourself. Their songs go through the same player as local files, so the equalizer, even volume,
crossfade, queue, lyrics and stats work on them too. They need the **Local music** feature, which
provides that player.

## Music server (Subsonic, Navidrome, Airsonic, Gonic…)

"Server" in the sidebar (or Settings → General). Give the address, user name and password of your
server; albums, artists, playlists and search are listed, and songs are fetched from the server when
played.

- The password is kept on this computer only. It is never sent: each request carries a one-time token,
  `md5(password + salt)`, the way the Subsonic API asks (`features/server/md5.ts`, `subsonic.ts`).
- Backups leave the password out.
- Songs of types this system's webview cannot play (Ogg and Opus on macOS) are skipped with a message.
  Servers can transcode; that is a setting on the server.

## Podcasts

"Podcasts" in the sidebar. Follow a show by pasting its feed address, or search the iTunes directory
(`itunes.apple.com`). Episodes are fetched when you play them, the player remembers where you stopped in
each one, and an episode that is nearly over counts as heard.

Episode audio is usually served through trackers and CDNs the feed does not name, so for episodes (and
only for them) a redirect may lead to any **public https** address: never plain http, never `localhost`,
`.local` or `.internal` names, and never private, loopback or link-local IP addresses
(`is_public_https` in `net.rs`). A feed is untrusted text; it is read with plain string matching
(`features/podcasts/rss.ts`) and never run.

## Internet radio

"Radio" in the sidebar. Add a station by its stream address (a `.pls` or `.m3u` address is opened once to
find the stream in it), or search the radio-browser.info directory. A station never ends, so it is played
as it arrives through a relay on this computer rather than fetched first.

## How the web is reached

The app's own web rules allow only a fixed list of hosts, and your server cannot be on a list made when
the app was built. So fetching goes through Rust (`src-tauri/src/net.rs`):

- The UI tells Rust which hosts you added (`net_allow`); Rust fetches only from those (`net_text` for
  answers and feeds, `net_bytes` for songs and covers), follows redirects only to hosts on the list, and
  refuses anything that is not plain http or https, has a login in the address, or is too large.
- A web page cannot add a host or read anything else; the command is available to the app's own window
  only.
- Live radio never ends, so it cannot be fetched first. `radio_open` starts a small relay on `127.0.0.1`
  (a random port, one random address per station) that streams the station to the audio element.

See [privacy.md](privacy.md) for what leaves your computer.
