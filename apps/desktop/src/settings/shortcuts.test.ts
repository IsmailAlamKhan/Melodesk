import { describe, expect, it } from 'vitest';
import { shortcutProblem } from './store';

describe('shortcutProblem', () => {
  it('refuses the combinations that select or edit text in other apps', () => {
    expect(shortcutProblem('CommandOrControl+Shift+Right')).toBe('editing');
    expect(shortcutProblem('CommandOrControl+Shift+Left')).toBe('editing');
    expect(shortcutProblem('Alt+Left')).toBe('editing');
    expect(shortcutProblem('CommandOrControl+Backspace')).toBe('editing');
    expect(shortcutProblem('CommandOrControl+Alt+Up')).toBe('editing');
  });
  it('refuses clipboard, select-all and undo', () => {
    for (const k of ['A', 'C', 'V', 'X', 'Z']) {
      expect(shortcutProblem(`CommandOrControl+${k}`)).toBe('clipboard');
      expect(shortcutProblem(`CommandOrControl+Shift+${k}`)).toBe('clipboard');
    }
  });
  it('refuses a bare key or Shift alone', () => {
    expect(shortcutProblem('M')).toBe('noModifier');
    expect(shortcutProblem('Shift+Space')).toBe('noModifier');
  });
  it('allows ordinary combinations, function keys and media keys', () => {
    for (const combo of [
      'CommandOrControl+Alt+M',
      'CommandOrControl+Shift+Space',
      'CommandOrControl+Alt+P',
      'F8',
      'MediaPlayPause',
    ])
      expect(shortcutProblem(combo)).toBeNull();
  });
});
