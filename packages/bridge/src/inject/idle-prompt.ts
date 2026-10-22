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

const ACTIVE_MS = 30_000;
const RESUME_AFTER_MS = 1200;

/**
 * YouTube decides the page is idle from the time of the last input it saw, kept in `_lact`. The
 * player window never gets input, so that time never moves. Keeping it current, as input would,
 * stops the question from coming up at all.
 */
export function markActive(page: { _lact?: number }, now: number): void {
  page._lact = now;
}

let started = false;

/**
 * Keep the page from going idle, and answer the question if it comes anyway. `onConfirmed` is told
 * after an answer so the caller can start the music again if the question had paused it. Safe to
 * call more than once.
 */
export function watchIdlePrompt(onConfirmed?: () => void): void {
  if (started) return;
  started = true;
  const page = window as unknown as { _lact?: number };
  markActive(page, Date.now());
  window.setInterval(() => {
    markActive(page, Date.now());
  }, ACTIVE_MS);
  window.setInterval(() => {
    const button = findConfirmButton();
    if (!button) return;
    log('info', 'idle prompt: confirming "Continue watching?"');
    button.click();
    if (onConfirmed) window.setTimeout(onConfirmed, RESUME_AFTER_MS);
  }, CHECK_MS);
}
