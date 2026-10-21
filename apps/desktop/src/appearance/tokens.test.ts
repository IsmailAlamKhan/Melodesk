import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  accentForeground,
  contrast,
  ensureContrast,
  oklchToRgb,
  parseHex,
  parseOklch,
  presetRgb,
  toHex,
  ACCENT_PRESETS,
  type Rgb,
} from './color';
import { ACCENT_MIN_CONTRAST } from './apply';

const css = readFileSync(
  fileURLToPath(new URL('../../../../packages/ui/src/styles/tokens.css', import.meta.url)),
  'utf8',
);

/** Token values for a theme: the @theme block, overlaid with the theme's own block. */
function tokens(theme: 'dark' | 'light' | 'amoled'): Record<string, Rgb> {
  const read = (block: string): Record<string, Rgb> => {
    const out: Record<string, Rgb> = {};
    for (const m of block.matchAll(/--color-([\w-]+):\s*(oklch\([^)]*\));/gu)) {
      const rgb = parseOklch(m[2] ?? '');
      if (rgb && m[1]) out[m[1]] = rgb;
    }
    return out;
  };
  const base = read(css.slice(css.indexOf('@theme'), css.indexOf('}', css.indexOf('@theme'))));
  if (theme === 'dark') return base;
  const start = css.indexOf(`:root[data-theme='${theme}']`);
  return { ...base, ...read(css.slice(start, css.indexOf('}', start))) };
}

describe.each(['dark', 'light', 'amoled'] as const)('%s theme meets WCAG AA', (theme) => {
  const t = tokens(theme);
  const get = (k: string): Rgb => {
    const v = t[k];
    if (!v) throw new Error(`missing token ${k}`);
    return v;
  };
  it('body text', () => {
    expect(contrast(get('fg'), get('bg'))).toBeGreaterThanOrEqual(7);
    for (const surface of ['bg', 'bg-elevated', 'bg-overlay']) {
      expect(contrast(get('fg-muted'), get(surface))).toBeGreaterThanOrEqual(4.5);
      expect(contrast(get('fg-subtle'), get(surface))).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('accent fill with its text, and status colors as text', () => {
    expect(contrast(get('accent-fg'), get('accent'))).toBeGreaterThanOrEqual(4.5);
    for (const k of ['danger', 'warning', 'success', 'accent'])
      expect(contrast(get(k), get('bg'))).toBeGreaterThanOrEqual(4.5);
  });
  it('borders are visible but quiet', () => {
    expect(contrast(get('border'), get('bg'))).toBeGreaterThan(1.1);
  });
});

const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] * t + b[0] * (1 - t),
  a[1] * t + b[1] * (1 - t),
  a[2] * t + b[2] * (1 - t),
];
/** accent-soft is 14% accent; gradients can add a little more where they overlap. */
const TINT = 0.16;

describe.each(['dark', 'light', 'amoled'] as const)('%s theme: accent on its own tint', (theme) => {
  const t = tokens(theme);
  it('the default accent stays readable as text on the tinted surfaces', () => {
    const accent = t['accent'] ?? [0, 0, 0];
    for (const surface of ['bg', 'bg-elevated']) {
      const bg = t[surface] ?? [0, 0, 0];
      expect(contrast(accent, mixRgb(accent, bg, TINT))).toBeGreaterThanOrEqual(4.5);
    }
  });
  it('every preset, once nudged, does too', () => {
    const page = t['bg'] ?? [0, 0, 0];
    for (const p of ACCENT_PRESETS) {
      const accent = ensureContrast(presetRgb(p.id), page, ACCENT_MIN_CONTRAST);
      for (const surface of ['bg', 'bg-elevated']) {
        const bg = t[surface] ?? [0, 0, 0];
        expect(
          contrast(accent, mixRgb(accent, bg, TINT)),
          `${p.id} on ${surface}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe('color math', () => {
  it('matches known contrast ratios', () => {
    expect(contrast([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1);
    expect(contrast([119, 119, 119], [255, 255, 255])).toBeCloseTo(4.48, 1);
  });
  it('round-trips hex and converts oklch', () => {
    expect(toHex(parseHex('#abc') ?? [0, 0, 0])).toBe('#aabbcc');
    expect(parseHex('nope')).toBeNull();
    expect(toHex(oklchToRgb(1, 0, 0))).toBe('#ffffff');
    expect(toHex(oklchToRgb(0, 0, 0))).toBe('#000000');
  });
  it('picks a readable foreground for any accent', () => {
    for (const p of ACCENT_PRESETS) {
      const rgb = presetRgb(p.id);
      const fg = parseHex(accentForeground(rgb));
      expect(fg).not.toBeNull();
      expect(contrast(rgb, fg ?? [0, 0, 0])).toBeGreaterThanOrEqual(4.5);
    }
    expect(accentForeground([255, 255, 0])).toBe('#0c0c0e');
    expect(accentForeground([20, 20, 120])).toBe('#ffffff');
  });
  it('nudges low-contrast accents until readable on the background', () => {
    const darkBg: Rgb = [20, 20, 22];
    const nudged = ensureContrast([40, 40, 90], darkBg, 4.5);
    expect(contrast(nudged, darkBg)).toBeGreaterThanOrEqual(4.5);
    const lightBg: Rgb = [250, 250, 250];
    expect(contrast(ensureContrast([255, 240, 150], lightBg, 4.5), lightBg)).toBeGreaterThanOrEqual(
      4.5,
    );
    const ok: Rgb = [255, 120, 100];
    expect(ensureContrast(ok, darkBg, 4.5)).toEqual(ok);
  });
});
