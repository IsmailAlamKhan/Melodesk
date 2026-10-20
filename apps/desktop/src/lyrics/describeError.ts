import type { MessageKey } from '../i18n';
import { TranslateError } from './translate';

/** A localized, user-facing message for a translation failure. */
export function describeTranslateError(
  err: unknown,
  t: (key: MessageKey, params?: Record<string, string>) => string,
): string {
  if (!(err instanceof TranslateError)) return t('lyrics.err.unknown');
  switch (err.code) {
    case 'quota':
      return t('lyrics.err.quota');
    case 'network':
      return t('lyrics.err.network', { detail: err.detail });
    case 'libreAddress':
      return t('lyrics.err.libreAddress');
    case 'libreLocalOnly':
      return t('lyrics.err.libreLocalOnly');
    case 'sameLanguage':
      return t('lyrics.err.sameLanguage');
    case 'provider':
      return t('lyrics.err.provider', { detail: err.detail });
  }
}
