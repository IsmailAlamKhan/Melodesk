# 07 — Video and ads

## Goal

Show a song's music video, and let the listener press YouTube's own Skip on a skippable ad, without
changing what the player does or hiding anything.

## Needs

02, 06.

## Constraints

- Ads are never blocked, hidden or skipped automatically. **Skip ad** only presses the page's own Skip
  button when the listener presses ours, and only if the page shows one.
- The picture only exists in the player window, so video mode shows that window; closing it returns to
  audio (the UI sends `setVideoMode false`) so frames are not decoded for a window nobody sees.
- Some accounts have no Song/Video switch: then the picture is shown as the page has it.

## Build

Verified against the live music.youtube.com page (not assumed):

1. **Switching**: `SET_PLAYER_AUDIO_ONLY` and `SET_PLAYER_PAGE_INFO` store dispatches **do nothing**. The
   page's own `ytmusic-av-toggle` works even while the player page is closed (UI state `MINIPLAYER`,
   zero-size): attributes `playback-mode` (`OMV_PREFERRED`/`ATV_PREFERRED`),
   `is-video-playback-mode-selected`, `selected-item-has-video`; buttons `.song-button`, `.video-button`.
   `setVideoMode` presses the right one if the state differs, then calls `setVideoLayout`, then re-emits
   flags at 700 ms and 2.5 s (attributes change a moment later).
2. **Layout** (`inject/video-layout.ts`, a constructed stylesheet so the page CSP cannot block it):
   `ytmusic-player-page#player-page` has `will-change: transform`, which makes it the frame of anything
   fixed inside; the sheet sets `will-change:auto; transform:none; position:fixed; inset:0;
z-index:2147483645; background:#000` on it, hides `#side-panel`, `.side-panel`, `ytmusic-av-toggle`,
   `.song-media-controls`, `#player-bar-background`, and fixes `#movie_player` and its video to fill the
   window with `object-fit: contain`. Result (checked by screenshot): only the picture, full window.
3. **Flags** (`emitFlags`): `isVideo` = toggle's `is-video-playback-mode-selected` (else the bridge's own
   record); `videoAvailable` = toggle has `selected-item-has-video` or video is selected (else assume
   true); `adPlaying` = store `adPlaying` or `#movie_player` has `ad-showing`/`ad-interrupting`;
   `adSkippable` = `adPlaying` and a visible skip button exists. While an ad plays without a skip button,
   look again every second (the button appears seconds in, without a store change).
4. **Skip button lookup** (`skipButton`, `selectors.skipAd`, searched in the **whole document**, because
   YouTube uses a detached container): `.ytp-skip-ad-button`, `.ytp-ad-skip-button-modern`,
   `.ytp-ad-skip-button`, `.ytp-ad-skip-button-container button`, `.ytp-ad-skip-button-slot button`
   (all names confirmed in YouTube's player script). Visible = `getClientRects().length > 0` and not
   `visibility:hidden` (an element with a fixed-position ancestor has **no `offsetParent`**, so that is
   the wrong test). Then `closest('button').click()` and re-emit flags at 600 ms.
5. **UI**: PlayerBar video button (wide windows), pressing it sends `setVideoMode` and
   `setPlayerVisible(video)`.

Rust: `PlayerCommand::SkipAd`, `SetVideoMode`.

## Acceptance

- e2e `video.e2e.ts` (button enabled for a song with video, sends `setVideoMode`, shows "Switch to
  song" while in video, disabled with "This song has no video") and `skip-ad.e2e.ts` (shows "Ad playing",
  disabled until skippable, sends `skipAd`, disappears when the ad ends).
- Bridge tests pass. Manual: in the app, press the video button on a song that has a video: a window
  showing only the picture appears; close it and the song continues as audio.

## Known limits

- **Skip ad has not been exercised against a real ad** (none could be triggered). The selectors come from
  YouTube's player script; if an ad's button differs, extend `selectors.skipAd`.
- The video window is separate from the main window by design (a child webview was ruled out).
