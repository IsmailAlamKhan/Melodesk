/**
 * Injected into the player webview as a Tauri initialization script. It runs on every
 * document in that webview, including Google's sign-in pages, so the very first thing
 * it does is bail out anywhere other than music.youtube.com. It never reads forms,
 * cookies, or storage.
 */
import { BridgeController } from './controller';

const GLOBAL_KEY = '__melodesk__';

(() => {
  if (window.location.hostname !== 'music.youtube.com') return;
  if (window.top !== window) return; // main frame only
  const w = window as unknown as Record<string, unknown>;
  if (w[GLOBAL_KEY]) return;

  const controller = new BridgeController();
  Object.defineProperty(window, GLOBAL_KEY, {
    value: Object.freeze({
      version: __BRIDGE_VERSION__,
      dispatch: (cmd: unknown) => {
        controller.dispatch(cmd);
      },
    }),
    writable: false,
    configurable: false,
    enumerable: false,
  });
  controller.start();
})();
