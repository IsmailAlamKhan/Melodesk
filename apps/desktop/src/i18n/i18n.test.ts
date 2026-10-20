import { describe, expect, it } from 'vitest';
import { formatDurationLocale, resolveLocale, translate } from './index';
import { pseudoAccent, pseudoRtl, pseudoize } from './pseudo';

describe('locale resolution', () => {
  const available = ['en', 'es', 'pt-BR', 'ar'];
  it('uses an explicit preference when available', () => {
    expect(resolveLocale('es', ['fr'], available)).toBe('es');
    expect(resolveLocale('xx', ['es'], available)).toBe('en');
  });
  it('follows system languages in order, matching region then base language', () => {
    expect(resolveLocale('system', ['pt-BR', 'en'], available)).toBe('pt-BR');
    expect(resolveLocale('system', ['pt-PT', 'en'], available)).toBe('pt-BR');
    expect(resolveLocale('system', ['fr-FR', 'es-MX'], available)).toBe('es');
    expect(resolveLocale('system', ['fr'], available)).toBe('en');
  });
});

describe('translate', () => {
  const key = 'common.close' as const;
  it('falls back to English for missing keys and unknown locales', () => {
    expect(translate('en', null, key)).toBe('Close');
    expect(translate('es', { 'common.cancel': 'Cancelar' }, key)).toBe('Close');
    expect(translate('es', { [key]: 'Cerrar' }, key)).toBe('Cerrar');
  });
  it('interpolates and keeps unknown placeholders', () => {
    const cat = { 'x.y': 'Hi {name}, {n} left, {missing}' } as Record<string, string>;
    expect(translate('en', cat, 'x.y' as never, { name: 'Ana', n: 2 })).toBe(
      'Hi Ana, 2 left, {missing}',
    );
  });
  it('selects plural forms per locale', () => {
    // Uses a synthetic catalog through the same code path as real locales.
    const cat: Record<string, string> = {
      'p.k_one': '{count} song',
      'p.k_other': '{count} songs',
      'p.k_few': '{count} pesme',
    };
    const k = 'p.k' as never;
    // English fallback is absent for this key, so call with a catalog-bearing non-English locale.
    expect(translate('de', cat, k, { count: 1 })).toBe('1 song');
    expect(translate('de', cat, k, { count: 3 })).toBe('3 songs');
    expect(translate('sr', cat, k, { count: 3 })).toBe('3 pesme');
  });
});

describe('pseudo-locales', () => {
  it('accents and pads text but keeps placeholders intact', () => {
    const out = pseudoAccent('Play {title}');
    expect(out.startsWith('[')).toBe(true);
    expect(out).toContain('{title}');
    expect(out).toContain('Ƥĺàý');
    expect(out.length).toBeGreaterThan('Play {title}'.length);
  });
  it('wraps right-to-left test text in bidi marks', () => {
    expect(pseudoRtl('Hello {name}')).toBe('‮Hello ‬{name}');
    expect(pseudoize('ar-XB', 'Hi')).toBe('‮Hi‬');
  });
  it('translates through pseudo-locales from English', () => {
    expect(translate('en-XA', null, 'common.close')).toContain('Ç');
  });
});

describe('duration formatting', () => {
  it('formats in the locale', () => {
    expect(formatDurationLocale(65 * 60, 'en')).toMatch(/1\s*hr.*5\s*min/u);
    expect(formatDurationLocale(20 * 60, 'en')).toMatch(/20\s*min/u);
  });
});
