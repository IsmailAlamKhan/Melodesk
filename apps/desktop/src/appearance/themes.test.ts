import { describe, expect, it } from 'vitest';
import { decodeTheme, encodeTheme, isPreset, presetPrefs, THEME_PRESETS } from './themes';

const preset = (i: number) => {
  const p = THEME_PRESETS[i];
  if (!p) throw new Error('no such preset');
  return p;
};

describe('theme codes', () => {
  it('carry a look from one machine to another', () => {
    for (const p of THEME_PRESETS) {
      const code = encodeTheme(presetPrefs(p));
      expect(code.startsWith('melodesk-theme:1:')).toBe(true);
      expect(decodeTheme(code)).toEqual(presetPrefs(p));
    }
    const art = { theme: 'system', accent: { kind: 'art' }, contrast: 'high' } as const;
    expect(decodeTheme(encodeTheme(art))).toEqual(art);
    const preset = {
      theme: 'light',
      accent: { kind: 'preset', id: 'coral' },
      contrast: 'medium',
    } as const;
    expect(decodeTheme(encodeTheme(preset))).toEqual(preset);
  });

  it('ignore spaces around a pasted code', () => {
    const code = encodeTheme(presetPrefs(preset(0)));
    expect(decodeTheme(`  ${code}\n`)).not.toBeNull();
  });

  it('refuse anything that is not a theme code, or is a broken or hostile one', () => {
    expect(decodeTheme('')).toBeNull();
    expect(decodeTheme('hello')).toBeNull();
    expect(decodeTheme('melodesk-theme:1:!!!')).toBeNull();
    const bad = (obj: unknown): string =>
      'melodesk-theme:1:' + btoa(JSON.stringify(obj)).replace(/=+$/u, '');
    expect(
      decodeTheme(bad({ t: 'dark', c: 'standard', a: 'url(javascript:alert(1))' })),
    ).toBeNull();
    expect(decodeTheme(bad({ t: 'neon', c: 'standard', a: '#ffffff' }))).toBeNull();
    expect(decodeTheme(bad({ t: 'dark', c: 'extreme', a: '#ffffff' }))).toBeNull();
    expect(decodeTheme(bad({ t: 'dark', c: 'standard' }))).toBeNull();
  });
});

describe('presets', () => {
  it('know when they are the current look, and only then', () => {
    const p = preset(1);
    expect(isPreset(p, presetPrefs(p))).toBe(true);
    expect(isPreset(p, { ...presetPrefs(p), theme: 'light' })).toBe(false);
    expect(isPreset(p, { ...presetPrefs(p), accent: { kind: 'art' } })).toBe(false);
  });
  it('have unique ids', () => {
    expect(new Set(THEME_PRESETS.map((p) => p.id)).size).toBe(THEME_PRESETS.length);
  });
});
