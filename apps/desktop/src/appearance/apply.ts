import type { Rgb } from './color';
import { colorVars, seedFor, type ThemeName, type Vars } from './material';
import type { AppearancePrefs } from './store';

export type ResolvedTheme = ThemeName;

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

/** Key under which the last non-default scheme is cached for the early-load script. */
export const VARS_CACHE_KEY = 'melodesk.theme-vars';

/** The Material scheme variables for the user's accent (or the album art) in this theme. */
export function schemeVars(prefs: AppearancePrefs, theme: ResolvedTheme, artRgb: Rgb | null): Vars {
  return colorVars(seedFor(prefs.accent, artRgb), theme, prefs.contrast);
}

/** Write the resolved appearance onto <html>. */
export function applyToDocument(opts: {
  theme: ResolvedTheme;
  density: AppearancePrefs['density'];
  dir: 'ltr' | 'rtl';
  lang: string;
  vars: Vars;
}): void {
  const root = document.documentElement;
  root.dataset['theme'] = opts.theme;
  root.dataset['density'] = opts.density;
  root.dir = opts.dir;
  root.lang = opts.lang;
  for (const [name, value] of Object.entries(opts.vars)) root.style.setProperty(name, value);
}

/**
 * Remember the applied scheme so the next launch can paint it before React starts (otherwise a
 * non-default accent would flash the default colours). The default scheme is already in the CSS.
 */
export function cacheVars(theme: ResolvedTheme, vars: Vars, isDefault: boolean): void {
  try {
    if (isDefault) localStorage.removeItem(VARS_CACHE_KEY);
    else localStorage.setItem(VARS_CACHE_KEY, JSON.stringify({ theme, vars }));
  } catch {
    /* private mode: the app still applies it once React has started */
  }
}
