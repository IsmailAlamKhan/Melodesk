import { afterEach, describe, expect, it, vi } from 'vitest';
import { findConfirmButton, markActive } from '../src/inject/idle-prompt';

interface FakeEl {
  tagName: string;
  textContent: string;
  shown?: boolean;
  buttons?: string[];
}

/** Just enough DOM for `findConfirmButton`: dialogs with a few buttons. */
function page(dialogs: FakeEl[]): void {
  vi.stubGlobal('document', {
    querySelectorAll: () =>
      dialogs.map((d) => ({
        tagName: d.tagName,
        textContent: d.textContent,
        getClientRects: () => (d.shown === false ? [] : [{}]),
        querySelectorAll: () => (d.buttons ?? []).map((name) => ({ name })),
      })),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const confirm = (): unknown => findConfirmButton();

describe('the "Continue watching?" prompt', () => {
  it("answers YouTube's own question with its last (positive) button", () => {
    page([{ tagName: 'YTMUSIC-YOU-THERE-RENDERER', textContent: '?', buttons: ['Yes'] }]);
    expect(confirm()).toEqual({ name: 'Yes' });
  });

  it('answers a generic dialog only when it asks to continue watching', () => {
    page([
      {
        tagName: 'TP-YT-PAPER-DIALOG',
        textContent: 'Video paused. Continue watching?',
        buttons: ['No', 'Yes'],
      },
    ]);
    expect(confirm()).toEqual({ name: 'Yes' });
  });

  it('never answers other dialogs for the user', () => {
    page([
      {
        tagName: 'YT-CONFIRM-DIALOG-RENDERER',
        textContent: 'Delete playlist? This cannot be undone.',
        buttons: ['Cancel', 'Delete'],
      },
    ]);
    expect(confirm()).toBeNull();
  });

  it('ignores a prompt that is in the page but not on screen', () => {
    page([
      { tagName: 'YTMUSIC-YOU-THERE-RENDERER', textContent: '', buttons: ['Yes'], shown: false },
    ]);
    expect(confirm()).toBeNull();
  });
});

describe('keeping the page from going idle', () => {
  it('moves the page’s last-activity time to now', () => {
    const page: { _lact?: number } = { _lact: 1 };
    markActive(page, 5000);
    expect(page._lact).toBe(5000);
  });
});
