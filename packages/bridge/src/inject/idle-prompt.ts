/**
 * YouTube pauses playback and asks "Video paused. Continue watching?" when the page has seen no
 * mouse or keyboard input for a while. The player lives in a hidden window, so it never sees the
 * user's input and the question comes up in the middle of a listening session. Answering "Yes" is
 * what the user would do; this does it for them, the same as pressing the button.
 */
import { selectors } from './selectors.v1';
import { log } from './transport';

const CHECK_MS = 2000;
const CONFIRM_TEXT = /continue watching/iu;

/** The dialog's confirm button, if the question is on screen. */
export function findConfirmButton(): HTMLElement | null {
  for (const dialog of document.querySelectorAll(selectors.idlePrompt)) {
    // `you-there` is YouTube's own element for exactly this question; a generic confirm dialog must
    // say it in words, so no other dialog (delete a playlist…) is ever answered for the user.
    const dedicated = dialog.tagName.toLowerCase().includes('you-there');
    if (!dedicated && !CONFIRM_TEXT.test(dialog.textContent)) continue;
    if (dialog.getClientRects().length === 0) continue; // present in the page but not shown
    const buttons = [...dialog.querySelectorAll<HTMLElement>('button, yt-button-renderer')];
    // "Yes" is the one positive action; with a single button there is nothing to choose between.
    return buttons.at(-1) ?? null;
  }
  return null;
}

let started = false;

/** Keep watching for the question; safe to call more than once. */
export function watchIdlePrompt(): void {
  if (started) return;
  started = true;
  window.setInterval(() => {
    const button = findConfirmButton();
    if (!button) return;
    log('info', 'idle prompt: confirming "Continue watching?"');
    button.click();
  }, CHECK_MS);
}
