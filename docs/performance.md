# Performance

Budgets from the project brief, what we measured, and how, so the numbers can be reproduced and
compared on other machines. Measured on **macOS 27.0.1, Apple M2 Pro, release build, 2026-10-21**.

| Budget               | Target   | Measured           | Status      |
| -------------------- | -------- | ------------------ | ----------- |
| Installer size       | < 20 MB  | about 5.0 MB (DMG) | met         |
| Idle memory          | < 250 MB | about 427 MB       | **not met** |
| Cold start to usable | < 2 s    | not measured       | open        |
| Interface frame rate | 60 fps   | not measured       | open        |

## Installer size

`pnpm --filter @melodesk/desktop tauri build --bundles app` gives a 8.7 MB binary and an 8.9 MB
`Melodesk.app`; the updater archive (`.app.tar.gz`) is 4.9 MB and a compressed DMG made with
`hdiutil create -format UDZO` is 5.0 MB. Windows (MSI/NSIS) and Linux sizes are not measured yet.
The updater signing step needs `TAURI_SIGNING_PRIVATE_KEY`; without it the build stops after bundling.

## Idle memory

Method: quit everything of ours, list the `com.apple.WebKit.*` helper processes, launch the release
binary, wait 45 seconds on the Home page with nothing playing, list the helpers again, and take the
**physical footprint** (`footprint -p`) of the app and of each new helper. (`ps` RSS double-counts
shared libraries, so it overstates.) The new helpers belong to us; other apps' helpers were present
before and are excluded.

| Process                               | Footprint   |
| ------------------------------------- | ----------- |
| Melodesk (Rust shell)                 | 68 MB       |
| WebKit GPU                            | 20 MB       |
| WebKit Networking                     | 12 MB       |
| WebContent: the YouTube Music page    | 242 MB      |
| WebContent: our own interface         | 60 MB       |
| WebContent: two small extra processes | 25 MB       |
| **Total**                             | **~427 MB** |

What this says:

- The YouTube Music page alone (242 MB) is already close to the whole budget, and it grows while
  playing. We can't make the page smaller, and we can't drop it without stopping playback.
- Everything that is ours (shell, interface, helpers) is roughly 185 MB. The 68 MB shell is higher
  than expected and the first place to look.
- A budget that includes the web player probably isn't realistic; "excluding the page" or a higher
  figure is a decision for the maintainers. Until then this is reported as not met rather than
  redefined.

Windows (WebView2) and Linux (WebKitGTK) have not been measured; add numbers here.

## Idle CPU: an open finding

On the dev build (macOS, 2026-10-21), with nothing playing, one WebKit WebContent process of the app
sat at a steady ~27-29% CPU and the shell at ~7-8%. A profile sample showed continuous JavaScript
allocation and garbage collection plus layout and paint, which looks like a polling or animation loop.
It is not yet attributed to our interface or to the YouTube Music page in the player window (it is a
debug build with the dev server, too). Next step: sample each webview separately (the player window
shown with `MELODESK_DEV_SHOW_PLAYER=1`, then hidden) with Safari's Web Inspector timeline, and compare
with a release build.

### Update, 2026-10-22

Sampling the same dev build over several one-second intervals with nothing playing (Home page, window
open): the shell 1.5%, our interface's WebContent 0.0%, the player's WebContent 0.0%. The 27-29% above
did not come back after the interface was reworked, so it is probably gone; it is left here as a
reminder to re-check on a release build. With music playing, the page's own main-thread CPU in the e2e
mock was about 3.3% for the interface alone and about 4.5% with the music visuals on (they run only
while music plays, in a window that can be seen, and change a few CSS variables on small elements).
Physical footprints at that point: our interface 188 MB (dev build, 20 minutes in), the player page
240 MB.

## Not measured yet

- **Cold start**: needs a time-to-interactive probe that works in release builds (the dev logging that
  would give it is compiled out). A `MELODESK_STARTUP_LOG` timestamp on the first `ready` event would do.
- **Frame rate**: record a performance trace of the Home page scroll and the karaoke view in the
  app (Safari Web Inspector on the main webview) and note dropped frames.
