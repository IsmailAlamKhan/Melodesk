/**
 * Translation framework.
 *
 * - English (`locales/en.json`) is the source of truth and is always bundled.
 * - Every other `locales/<code>.json` is loaded on demand and may be partial: missing keys
 *   fall back to English.
 * - Keys are flat dotted strings. `{name}` interpolates. Plurals use `key_one`, `key_other`
 *   (any CLDR category) selected with Intl.PluralRules from the `count` parameter.
 * - Run `pnpm i18n:check` to compare locale files against English.
 */
import { create } from 'zustand';
import { useAppearance } from '../appearance/store';
import en from './locales/en.json';
import { isPseudo, pseudoize, PSEUDO_LOCALES } from './pseudo';

export type MessageKey = keyof typeof en;
export type Params = Record<string, string | number>;
type Catalog = Record<string, string>;

const loaders = import.meta.glob<Catalog>('./locales/*.json', { import: 'default' });
const fileLocales = Object.keys(loaders)
  .map((p) => /\/([^/]+)\.json$/u.exec(p)?.[1])
  .filter((c): c is string => !!c && c !== 'en');

/** Locales a user can choose: English, shipped translations, and pseudo-locales in dev. */
export function availableLocales(): string[] {
  return ['en', ...fileLocales.sort(), ...(import.meta.env.DEV ? PSEUDO_LOCALES : [])];
}

/** Pick the best available locale for a preference ("system" or a code) and browser languages. */
export function resolveLocale(
  pref: string,
  systemLanguages: readonly string[],
  available: readonly string[],
): string {
  const find = (code: string): string | undefined => {
    const exact = available.find((a) => a.toLowerCase() === code.toLowerCase());
    if (exact) return exact;
    const base = code.split('-')[0]?.toLowerCase();
    return (
      available.find((a) => a.toLowerCase() === base) ??
      available.find((a) => a.split('-')[0]?.toLowerCase() === base && !isPseudo(a))
    );
  };
  if (pref !== 'system') return find(pref) ?? 'en';
  for (const lang of systemLanguages) {
    const hit = find(lang);
    if (hit) return hit;
  }
  return 'en';
}

interface I18nState {
  locale: string;
  catalog: Catalog | null;
  setLocale: (locale: string) => Promise<void>;
}

export const useI18n = create<I18nState>((set, get) => ({
  locale: 'en',
  catalog: null,
  setLocale: async (locale) => {
    if (locale === get().locale && (locale === 'en' || isPseudo(locale) || get().catalog)) return;
    if (locale === 'en' || isPseudo(locale)) {
      set({ locale, catalog: null });
      return;
    }
    const load = loaders[`./locales/${locale}.json`];
    const catalog = load ? await load() : null;
    set({ locale, catalog });
  },
}));

/** The locale actually in use, following the language preference and the system languages. */
export function useResolvedLocale(): string {
  const pref = useAppearance((s) => s.language);
  const locale = useI18n((s) => s.locale);
  // Keep the store in step with the preference.
  const wanted = resolveLocale(pref, navigator.languages, availableLocales());
  if (wanted !== locale) void useI18n.getState().setLocale(wanted);
  return locale;
}

const rulesCache = new Map<string, Intl.PluralRules>();
function pluralCategory(locale: string, n: number): string {
  const key = isPseudo(locale) ? 'en' : locale;
  let rules = rulesCache.get(key);
  if (!rules) {
    try {
      rules = new Intl.PluralRules(key);
    } catch {
      rules = new Intl.PluralRules('en');
    }
    rulesCache.set(key, rules);
  }
  return rules.select(n);
}

function interpolate(s: string, params?: Params): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/gu, (m, name: string) => (name in params ? String(params[name]) : m));
}

/** Translate `key` for `locale` (pure; used by both hooks and non-React code). */
export function translate(
  locale: string,
  catalog: Catalog | null,
  key: MessageKey,
  params?: Params,
): string {
  const english = en as Catalog;
  const lookup = (table: Catalog | null): string | undefined => {
    if (!table) return undefined;
    if (params && typeof params['count'] === 'number') {
      const cat = pluralCategory(locale, params['count']);
      return table[`${key}_${cat}`] ?? table[`${key}_other`] ?? table[key];
    }
    return table[key];
  };
  if (isPseudo(locale)) return pseudoize(locale, interpolate(lookup(english) ?? key, params));
  return interpolate(lookup(catalog) ?? lookup(english) ?? key, params);
}

/** For code outside React (toasts, native labels). */
export function t(key: MessageKey, params?: Params): string {
  const { locale, catalog } = useI18n.getState();
  return translate(locale, catalog, key, params);
}

/** For components: re-renders when the language changes. */
export function useT(): (key: MessageKey, params?: Params) => string {
  const locale = useI18n((s) => s.locale);
  const catalog = useI18n((s) => s.catalog);
  return (key, params) => translate(locale, catalog, key, params);
}

/** Display name of a locale in its own language, e.g. "Español". */
export function localeName(code: string): string {
  if (code === 'en-XA') return 'Pseudo (accented, longer text)';
  if (code === 'ar-XB') return 'Pseudo (right-to-left)';
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code);
    return name ? name.charAt(0).toLocaleUpperCase(code) + name.slice(1) : code;
  } catch {
    return code;
  }
}

/** Compact duration like "1 h 05 min" in the current locale. */
export function formatDurationLocale(seconds: number, locale: string): string {
  const base = isPseudo(locale) ? 'en' : locale;
  const nf = (unit: 'hour' | 'minute', v: number): string =>
    new Intl.NumberFormat(base, { style: 'unit', unit, unitDisplay: 'short' }).format(v);
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h === 0 ? nf('minute', m) : `${nf('hour', h)} ${nf('minute', m)}`;
}
