/**
 * Video layout: when the user switches to video, the player window shows just the picture, filling
 * the window, instead of the whole music.youtube.com page. This only moves and sizes YouTube's own
 * player element with a stylesheet; the stream, its controls and its ads are untouched.
 *
 * A constructed stylesheet is used instead of a <style> tag so the page's CSP cannot block it.
 */
const CSS = `
html, body { background: #000 !important; overflow: hidden !important; }
/* The page keeps its player page in a layer that is moved around (will-change: transform), which makes
   it the frame of anything fixed inside it. Take the layer away, then lay the page over the window. */
ytmusic-app, ytmusic-app-layout, ytmusic-player { transform: none !important; filter: none !important; contain: none !important; }
ytmusic-player-page, ytmusic-player-page#player-page {
  will-change: auto !important; transform: none !important; contain: none !important;
  display: block !important; visibility: visible !important; opacity: 1 !important;
  position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
  z-index: 2147483645 !important; background: #000 !important; overflow: hidden !important;
}
/* Only the picture: no queue, lyrics tabs or switch. */
ytmusic-player-page #side-panel, ytmusic-player-page .side-panel, ytmusic-player-page ytmusic-av-toggle,
ytmusic-player-page .song-media-controls, ytmusic-player-page #player-bar-background { display: none !important; }
#movie_player {
  position: fixed !important; inset: 0 !important; width: 100vw !important; height: 100vh !important;
  max-width: none !important; max-height: none !important; margin: 0 !important;
  z-index: 2147483646 !important; background: #000 !important;
}
#movie_player .html5-video-container { position: absolute !important; inset: 0 !important; width: 100% !important; height: 100% !important; }
#movie_player video.html5-main-video {
  position: absolute !important; left: 0 !important; top: 0 !important;
  width: 100% !important; height: 100% !important; object-fit: contain !important;
}
`;

let sheet: CSSStyleSheet | null = null;

/** Show the video full-window (`true`) or restore the normal page (`false`). */
export function setVideoLayout(on: boolean): void {
  try {
    sheet ??= (() => {
      const s = new CSSStyleSheet();
      s.replaceSync(CSS);
      return s;
    })();
    const rest = document.adoptedStyleSheets.filter((s) => s !== sheet);
    document.adoptedStyleSheets = on ? [...rest, sheet] : rest;
  } catch {
    /* an old webview without constructed stylesheets: the page keeps its own layout */
  }
}
