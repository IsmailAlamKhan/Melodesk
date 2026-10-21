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
import { roleColors, type ContrastLevel, type ThemeName } from './material';

const css = readFileSync(
  fileURLToPath(new URL('../../../../packages/ui/src/styles/tokens.css', import.meta.url)),
  'utf8',
);

/** Token values for a theme: the @theme block, overlaid with the theme's own block. */
function tokens(theme: 'dark' | 'light' | 'amoled'): Record<string, Rgb> {
  const read = (block: string): Record<string, Rgb> => {
    const out: Record<string, Rgb> = {};
    for (const m of block.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{6}|oklch\([^)]*\));/gu)) {
      const value = m[2] ?? '';
      const rgb = value.startsWith('#') ? parseHex(value) : parseOklch(value);
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

/** Pairs that must read as text or as a control label: [foreground role, background role]. */
const PAIRS: [string, string][] = [
  ['on-surface', 'surface'],
  ['on-surface', 'surface-container-lowest'],
  ['on-surface', 'surface-container'],
  ['on-surface', 'surface-container-high'],
  ['on-surface', 'surface-container-highest'],
  ['on-surface-variant', 'surface'],
  ['on-surface-variant', 'surface-container'],
  ['on-surface-variant', 'surface-container-high'],
  ['on-surface-subtle', 'surface'],
  ['on-surface-subtle', 'surface-container'],
  ['on-surface-subtle', 'surface-container-high'],
  ['on-primary', 'primary'],
  ['on-primary-container', 'primary-container'],
  ['on-secondary', 'secondary'],
  ['on-secondary-container', 'secondary-container'],
  ['on-tertiary', 'tertiary'],
  ['on-tertiary-container', 'tertiary-container'],
  ['on-error', 'error'],
  ['on-error-container', 'error-container'],
  ['inverse-on-surface', 'inverse-surface'],
  // accent-coloured text and icons sit on the page and on raised surfaces
  ['primary', 'surface'],
  ['primary', 'surface-container'],
  ['error', 'surface'],
];

/** Presets, plus seeds that are hard for colour schemes: saturated, pale, dark and grey. */
const SEEDS = [
  ...ACCENT_PRESETS.map((p) => toHex(presetRgb(p.id))),
  '#ffff00',
  '#0000ff',
  '#00ff00',
  '#808080',
  '#101010',
  '#fafafa',
];

describe.each(['dark', 'light', 'amoled'] as const)('Material scheme (%s)', (theme: ThemeName) => {
  for (const level of ['standard', 'medium', 'high'] as ContrastLevel[])
    it(`every text pairing meets WCAG AA for ${String(SEEDS.length)} seeds at ${level} contrast`, () => {
      for (const seed of SEEDS) {
        const roles = roleColors(seed, theme, level) as Record<string, string>;
        for (const [fg, bg] of PAIRS) {
          const a = parseHex(roles[fg] ?? '');
          const b = parseHex(roles[bg] ?? '');
          if (!a || !b) throw new Error(`missing role ${fg} or ${bg}`);
          expect(
            contrast(a, b),
            `${seed} ${theme}/${level}: ${fg} on ${bg}`,
          ).toBeGreaterThanOrEqual(4.5);
        }
      }
    });

  it('keeps raised surfaces ordered from the page upward', () => {
    const r = roleColors(toHex(presetRgb('blue')), theme) as Record<string, string>;
    const lum = (k: string): number => {
      const c = parseHex(r[k] ?? '') ?? [0, 0, 0];
      return contrast(c, [0, 0, 0]);
    };
    const order = [
      'surface-container-lowest',
      'surface-container-low',
      'surface-container',
      'surface-container-high',
      'surface-container-highest',
    ];
    for (let i = 1; i < order.length; i += 1) {
      const lower = order[i - 1] ?? '';
      const upper = order[i] ?? '';
      if (theme === 'light') expect(lum(upper)).toBeLessThanOrEqual(lum(lower));
      else expect(lum(upper)).toBeGreaterThanOrEqual(lum(lower));
    }
  });
});

it('AMOLED has a pure black page', () => {
  expect(roleColors('#ff6f61', 'amoled').surface).toBe('#000000');
});

it('Expressive shifts hues: the secondary and tertiary containers differ from the primary', () => {
  const r = roleColors('#ff6f61', 'dark');
  expect(
    new Set([r['primary-container'], r['secondary-container'], r['tertiary-container']]).size,
  ).toBe(3);
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
