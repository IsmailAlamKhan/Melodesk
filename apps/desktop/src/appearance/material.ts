/**
 * Material 3 Expressive colour. A whole tonal scheme (primary, secondary, tertiary, error and the
 * surface family) is generated from one seed colour with Google's material-color-utilities, using
 * the Expressive variant and the 2025 spec. The library picks tones so that each "on-" colour is
 * readable on its container; tokens.test.ts re-checks that for every preset and contrast level.
 *
 * The scheme is exposed two ways: as Material role variables (`--color-primary-container`…) and as
 * the app's older names (`--color-bg`, `--color-fg`, `--color-accent`…) so existing classes keep
 * working while components move to the Material roles.
 */
import {
  Hct,
  MaterialDynamicColors,
  SchemeContent,
  SchemeExpressive,
  argbFromHex,
  hexFromArgb,
} from '@material/material-color-utilities';
import { presetRgb, toHex, type AccentPresetId, type Rgb } from './color';

export type ThemeName = 'dark' | 'light' | 'amoled';
export type ContrastLevel = 'standard' | 'medium' | 'high';
/**
 * `expressive` is the app's own look (the hues are rotated away from the seed for a livelier
 * palette); `content` keeps the seed's own hue, which is what colouring a page from its artwork needs.
 */
export type SchemeVariant = 'expressive' | 'content';

/** Material's contrast levels: 0 standard, 0.5 medium, 1 high. */
export const CONTRAST_VALUE: Record<ContrastLevel, number> = { standard: 0, medium: 0.5, high: 1 };

/** The seed when the user has not picked an accent: the violet preset, Material's own baseline hue. */
export const DEFAULT_SEED = toHex(presetRgb('purple'));

const m = new MaterialDynamicColors();

/** Material role → CSS variable name (without `--color-`). */
const ROLES = {
  primary: m.primary(),
  'on-primary': m.onPrimary(),
  'primary-container': m.primaryContainer(),
  'on-primary-container': m.onPrimaryContainer(),
  secondary: m.secondary(),
  'on-secondary': m.onSecondary(),
  'secondary-container': m.secondaryContainer(),
  'on-secondary-container': m.onSecondaryContainer(),
  tertiary: m.tertiary(),
  'on-tertiary': m.onTertiary(),
  'tertiary-container': m.tertiaryContainer(),
  'on-tertiary-container': m.onTertiaryContainer(),
  error: m.error(),
  'on-error': m.onError(),
  'error-container': m.errorContainer(),
  'on-error-container': m.onErrorContainer(),
  'surface-dim': m.surfaceDim(),
  surface: m.surface(),
  'surface-bright': m.surfaceBright(),
  'surface-container-lowest': m.surfaceContainerLowest(),
  'surface-container-low': m.surfaceContainerLow(),
  'surface-container': m.surfaceContainer(),
  'surface-container-high': m.surfaceContainerHigh(),
  'surface-container-highest': m.surfaceContainerHighest(),
  'on-surface': m.onSurface(),
  'on-surface-variant': m.onSurfaceVariant(),
  outline: m.outline(),
  'outline-variant': m.outlineVariant(),
  'inverse-surface': m.inverseSurface(),
  'inverse-on-surface': m.inverseOnSurface(),
  'inverse-primary': m.inversePrimary(),
  scrim: m.scrim(),
} as const;

export type Role = keyof typeof ROLES;
export type Vars = Record<string, string>;

/** The role colours (`#rrggbb`) for a seed, theme and contrast level. */
export function roleColors(
  seed: string,
  theme: ThemeName,
  contrast: ContrastLevel = 'standard',
  variant: SchemeVariant = 'expressive',
): Record<Role, string> & { 'on-surface-subtle': string } {
  const dark = theme !== 'light';
  const source = Hct.fromInt(argbFromHex(seed));
  const scheme =
    variant === 'content'
      ? new SchemeContent(source, dark, CONTRAST_VALUE[contrast], '2025')
      : new SchemeExpressive(source, dark, CONTRAST_VALUE[contrast], '2025');
  const out = {} as Record<Role, string>;
  for (const [name, color] of Object.entries(ROLES) as [Role, (typeof ROLES)[Role]][])
    out[name] = hexFromArgb(color.getArgb(scheme));

  if (theme === 'amoled') {
    // Pure black base for OLED; raised surfaces stay barely lighter, tinted with the scheme's hue.
    const n = (tone: number): string => hexFromArgb(scheme.neutralPalette.tone(tone));
    out.surface = '#000000';
    out['surface-dim'] = '#000000';
    out['surface-container-lowest'] = '#000000';
    out['surface-container-low'] = n(5);
    out['surface-container'] = n(9);
    out['surface-container-high'] = n(13);
    out['surface-container-highest'] = n(17);
    out['surface-bright'] = n(22);
  }
  // A third text level between on-surface-variant and the borders (placeholders, captions).
  const subtleTone = dark ? (contrast === 'standard' ? 72 : 80) : contrast === 'standard' ? 38 : 30;
  return {
    ...out,
    'on-surface-subtle': hexFromArgb(scheme.neutralVariantPalette.tone(subtleTone)),
  };
}

/**
 * Every colour variable for a seed and theme: the Material roles, plus the app's own names mapped
 * onto them. Keys include the `--color-` prefix.
 */
export function colorVars(
  seed: string,
  theme: ThemeName,
  contrast: ContrastLevel = 'standard',
  variant: SchemeVariant = 'expressive',
): Vars {
  const r = roleColors(seed, theme, contrast, variant);
  const vars: Vars = {};
  for (const [name, value] of Object.entries(r)) vars[`--color-${name}`] = value;
  Object.assign(vars, {
    '--color-bg': r.surface,
    '--color-bg-elevated': r['surface-container'],
    '--color-bg-overlay': r['surface-container-high'],
    '--color-fg': r['on-surface'],
    '--color-fg-muted': r['on-surface-variant'],
    '--color-fg-subtle': r['on-surface-subtle'],
    '--color-border': r['outline-variant'],
    '--color-accent': r.primary,
    '--color-accent-fg': r['on-primary'],
    '--color-danger': r.error,
  });
  return vars;
}

/** The seed colour for the user's accent choice (`art` falls back to the default without art). */
export function seedFor(
  accent:
    { kind: 'preset'; id: AccentPresetId } | { kind: 'custom'; hex: string } | { kind: 'art' },
  artRgb: Rgb | null,
): string {
  if (accent.kind === 'custom') return accent.hex;
  if (accent.kind === 'art') return artRgb ? toHex(artRgb) : DEFAULT_SEED;
  return toHex(presetRgb(accent.id));
}

/** `--name: value;` lines, for the generated block in tokens.css. */
export function cssBlock(vars: Vars, indent = '  '): string {
  return Object.entries(vars)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${indent}${k}: ${v};`)
    .join('\n');
}

/** How long colour changes (theme, accent, album-art colour) take to cross-fade. */
export const COLOR_TRANSITION_MS = 450;

/**
 * Registers every colour variable as a typed <color> property and gives the root a transition on
 * them. Without registration CSS treats a custom property as text and swaps it instantly; with it,
 * the value is interpolated and everything that inherits it fades together. Generated into
 * tokens.css (see tokens.generate.test.ts).
 */
export function registrationCss(): string {
  const names = Object.keys(colorVars(DEFAULT_SEED, 'dark')).sort();
  const rules = names
    .map(
      (n) =>
        `@property ${n} {\n  syntax: '<color>';\n  inherits: true;\n  initial-value: #000000;\n}`,
    )
    .join('\n');
  const transition = names
    .map((n) => `${n} ${String(COLOR_TRANSITION_MS)}ms var(--ease-out)`)
    .join(',\n    ');
  return `${rules}\n\n:root,\n.themed-scope {\n  transition:\n    ${transition};\n}\n`;
}
