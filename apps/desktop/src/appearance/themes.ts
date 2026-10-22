import type { MessageKey } from '../i18n';
import { ACCENT_PRESETS, parseHex, type AccentPresetId } from './color';
import type { ContrastLevel } from './material';
import { sanitize, type Accent, type AppearancePrefs, type ThemeMode } from './store';

/** A ready-made look: a theme mode and an accent, chosen to go together. */
export interface ThemePreset {
  id: string;
  name: MessageKey;
  theme: Exclude<ThemeMode, 'system'>;
  accent: string;
  contrast?: ContrastLevel;
}

export const THEME_PRESETS: ThemePreset[] = [
  { id: 'midnight', name: 'theme.preset.midnight', theme: 'dark', accent: '#7c5cff' },
  { id: 'ocean', name: 'theme.preset.ocean', theme: 'dark', accent: '#2e90fa' },
  { id: 'sunset', name: 'theme.preset.sunset', theme: 'dark', accent: '#ff7a45' },
  { id: 'forest', name: 'theme.preset.forest', theme: 'dark', accent: '#3dbb6c' },
  { id: 'rose', name: 'theme.preset.rose', theme: 'dark', accent: '#ff5c8a' },
  { id: 'ink', name: 'theme.preset.ink', theme: 'amoled', accent: '#c4b5fd' },
  { id: 'paper', name: 'theme.preset.paper', theme: 'light', accent: '#7c3aed' },
  { id: 'mint', name: 'theme.preset.mint', theme: 'light', accent: '#0f9d74' },
];

/** The preferences a preset sets (and nothing else: language, density and so on are left alone). */
export function presetPrefs(
  p: ThemePreset,
): Pick<AppearancePrefs, 'theme' | 'accent' | 'contrast'> {
  return {
    theme: p.theme,
    accent: { kind: 'custom', hex: p.accent },
    contrast: p.contrast ?? 'standard',
  };
}

/** Whether the current look is this preset. */
export function isPreset(
  p: ThemePreset,
  prefs: Pick<AppearancePrefs, 'theme' | 'accent' | 'contrast'>,
): boolean {
  return (
    prefs.theme === p.theme &&
    prefs.contrast === (p.contrast ?? 'standard') &&
    prefs.accent.kind === 'custom' &&
    prefs.accent.hex.toLowerCase() === p.accent.toLowerCase()
  );
}

const PREFIX = 'melodesk-theme:1:';

interface Shared {
  t: string;
  c: string;
  /** `art`, a preset accent's id, or `#rrggbb`. */
  a: string;
}

const b64 = (text: string): string =>
  btoa(String.fromCharCode(...new TextEncoder().encode(text)))
    .replace(/\+/gu, '-')
    .replace(/\//gu, '_')
    .replace(/=+$/u, '');

const unb64 = (code: string): string => {
  const padded = code.replace(/-/gu, '+').replace(/_/gu, '/');
  const bytes = Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
};

function accentCode(a: Accent): string {
  return a.kind === 'art' ? 'art' : a.kind === 'preset' ? a.id : a.hex.toLowerCase();
}

/** A short text that carries a look from one machine to another. */
export function encodeTheme(prefs: Pick<AppearancePrefs, 'theme' | 'accent' | 'contrast'>): string {
  const shared: Shared = { t: prefs.theme, c: prefs.contrast, a: accentCode(prefs.accent) };
  return PREFIX + b64(JSON.stringify(shared));
}

/** The look in a theme code, or null if it is not one (or not a valid one). */
export function decodeTheme(
  code: string,
): Pick<AppearancePrefs, 'theme' | 'accent' | 'contrast'> | null {
  const text = code.trim();
  if (!text.startsWith(PREFIX)) return null;
  let shared: Partial<Shared>;
  try {
    shared = JSON.parse(unb64(text.slice(PREFIX.length))) as Partial<Shared>;
  } catch {
    return null;
  }
  const a = shared.a ?? '';
  let accent: Accent | null = null;
  if (a === 'art') accent = { kind: 'art' };
  else if (ACCENT_PRESETS.some((p) => p.id === a))
    accent = { kind: 'preset', id: a as AccentPresetId };
  else if (/^#[0-9a-f]{6}$/iu.test(a) && parseHex(a)) accent = { kind: 'custom', hex: a };
  const themes = ['system', 'light', 'dark', 'amoled'];
  const contrasts = ['standard', 'medium', 'high'];
  if (!accent || !themes.includes(shared.t ?? '') || !contrasts.includes(shared.c ?? ''))
    return null;
  const clean = sanitize({ theme: shared.t, contrast: shared.c, accent });
  return { theme: clean.theme, accent: clean.accent, contrast: clean.contrast };
}
