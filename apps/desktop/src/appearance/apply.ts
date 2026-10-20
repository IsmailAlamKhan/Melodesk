import {
  accentForeground,
  ensureContrast,
  parseHex,
  parseOklch,
  presetRgb,
  toHex,
  type Rgb,
} from './color';
import type { AppearancePrefs } from './store';

export type ResolvedTheme = 'light' | 'dark' | 'amoled';

export function resolveTheme(
  mode: AppearancePrefs['theme'],
  systemPrefersLight: boolean,
): ResolvedTheme {
  return mode === 'system' ? (systemPrefersLight ? 'light' : 'dark') : mode;
}

const RTL_LANGS = new Set(['ar', 'he', 'fa', 'ur', 'ps', 'sd', 'ug', 'yi', 'dv', 'ckb']);

/** Pseudo-locale "ar-XB" is a right-to-left test locale used in development. */
export function isRtlLocale(locale: string): boolean {
  const base = (locale.split('-')[0] ?? '').toLowerCase();
  return locale === 'ar-XB' || RTL_LANGS.has(base);
}

export function resolveDirection(
  pref: AppearancePrefs['direction'],
  locale: string,
): 'ltr' | 'rtl' {
  return pref === 'auto' ? (isRtlLocale(locale) ? 'rtl' : 'ltr') : pref;
}

/** Fallback page backgrounds for contrast nudging (matches tokens.css). */
const BG: Record<ResolvedTheme, Rgb> = {
  dark: parseOklch('oklch(0.145 0.004 260)') ?? [20, 20, 22],
  amoled: [0, 0, 0],
  light: parseOklch('oklch(0.985 0.002 260)') ?? [250, 250, 250],
};

/** CSS variable overrides for the accent, or null to use the theme's own accent. */
export function accentVars(
  prefs: AppearancePrefs,
  theme: ResolvedTheme,
  artRgb: Rgb | null,
): { accent: string; accentFg: string } | null {
  let base: Rgb | null = null;
  if (prefs.accent.kind === 'custom') base = parseHex(prefs.accent.hex);
  else if (prefs.accent.kind === 'art') base = artRgb;
  else if (prefs.accent.id !== 'coral') base = presetRgb(prefs.accent.id);
  if (!base) return null;
  // Accent is used for text and icons on the page background as well as for fills.
  const readable = ensureContrast(base, BG[theme], 4.5);
  return { accent: toHex(readable), accentFg: accentForeground(readable) };
}

/** Write the resolved appearance onto <html>. */
export function applyToDocument(opts: {
  theme: ResolvedTheme;
  density: AppearancePrefs['density'];
  dir: 'ltr' | 'rtl';
  lang: string;
  accent: { accent: string; accentFg: string } | null;
}): void {
  const root = document.documentElement;
  root.dataset['theme'] = opts.theme;
  root.dataset['density'] = opts.density;
  root.dir = opts.dir;
  root.lang = opts.lang;
  if (opts.accent) {
    root.style.setProperty('--color-accent', opts.accent.accent);
    root.style.setProperty('--color-accent-fg', opts.accent.accentFg);
  } else {
    root.style.removeProperty('--color-accent');
    root.style.removeProperty('--color-accent-fg');
  }
}
