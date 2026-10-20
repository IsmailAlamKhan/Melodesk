/** Color math for themes: WCAG contrast, OKLCH conversion, and accent adjustment. */

export type Rgb = readonly [number, number, number]; // 0..255

export function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/iu.exec(hex.trim());
  if (!m?.[1]) return null;
  const h = m[1].length === 3 ? Array.from(m[1], (c) => c + c).join('') : m[1];
  return [
    Number.parseInt(h.slice(0, 2), 16),
    Number.parseInt(h.slice(2, 4), 16),
    Number.parseInt(h.slice(4, 6), 16),
  ];
}

export function toHex(rgb: Rgb): string {
  return `#${rgb
    .map((c) =>
      Math.round(Math.min(255, Math.max(0, c)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

const lin = (c: number): number => {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

/** WCAG relative luminance. */
export function luminance(rgb: Rgb): number {
  return 0.2126 * lin(rgb[0]) + 0.7152 * lin(rgb[1]) + 0.0722 * lin(rgb[2]);
}

/** WCAG contrast ratio, 1..21. */
export function contrast(a: Rgb, b: Rgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/** OKLCH to sRGB (0..255, clamped). */
export function oklchToRgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rl = 4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_;
  const gl = -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_;
  const bl = -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_;
  const enc = (v: number): number => {
    const x = Math.min(1, Math.max(0, v));
    return 255 * (x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055);
  };
  return [enc(rl), enc(gl), enc(bl)];
}

/** Parse a CSS `oklch(L C H)` string (as used in tokens.css). */
export function parseOklch(css: string): Rgb | null {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/u.exec(css);
  if (!m) return null;
  return oklchToRgb(Number(m[1]), Number(m[2]), Number(m[3]));
}

const WHITE: Rgb = [255, 255, 255];
const NEAR_BLACK: Rgb = [12, 12, 14];

/** Text color for content drawn on top of an accent fill. */
export function accentForeground(accent: Rgb): string {
  return contrast(accent, WHITE) >= contrast(accent, NEAR_BLACK) ? toHex(WHITE) : toHex(NEAR_BLACK);
}

const mix = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

/**
 * Nudge an accent toward white (on dark backgrounds) or black (on light ones) until it reaches
 * `min` contrast against the background, keeping its hue. Used for accent text and icons.
 */
export function ensureContrast(accent: Rgb, background: Rgb, min = 4.5): Rgb {
  if (contrast(accent, background) >= min) return accent;
  const target = luminance(background) < 0.4 ? WHITE : [0, 0, 0];
  for (let t = 0.05; t <= 1; t += 0.05) {
    const candidate = mix(accent, target as Rgb, t);
    if (contrast(candidate, background) >= min) return candidate;
  }
  return target as Rgb;
}

export const ACCENT_PRESETS = [
  { id: 'coral', label: 'Coral', oklch: [0.72, 0.17, 25] },
  { id: 'amber', label: 'Amber', oklch: [0.8, 0.15, 80] },
  { id: 'green', label: 'Green', oklch: [0.75, 0.15, 150] },
  { id: 'blue', label: 'Blue', oklch: [0.72, 0.15, 250] },
  { id: 'purple', label: 'Purple', oklch: [0.7, 0.17, 300] },
  { id: 'pink', label: 'Pink', oklch: [0.75, 0.17, 350] },
] as const;
export type AccentPresetId = (typeof ACCENT_PRESETS)[number]['id'];

export function presetRgb(id: AccentPresetId): Rgb {
  const p = ACCENT_PRESETS.find((x) => x.id === id) ?? ACCENT_PRESETS[0];
  return oklchToRgb(p.oklch[0], p.oklch[1], p.oklch[2]);
}
