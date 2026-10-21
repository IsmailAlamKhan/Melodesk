import { Button } from '@melodesk/ui';
import { useCallback, useEffect, useState } from 'react';
import { MAX_CACHE_BYTES, cacheStats, clearArtworkCache } from '../../artwork/cache';
import { intlLocale, useI18n, useT } from '../../i18n';
import { toast } from '../toast';

function megabytes(bytes: number, locale: string, digits = 1): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'unit',
    unit: 'megabyte',
    maximumFractionDigits: digits,
  }).format(bytes / (1024 * 1024));
}

/** What Melodesk keeps on this computer for offline use, and a way to clear it. */
export function StorageSection() {
  const t = useT();
  const locale = useI18n((s) => s.locale);
  const [stats, setStats] = useState<{ count: number; bytes: number } | null>(null);
  const refresh = useCallback(() => {
    void cacheStats().then(setStats);
  }, []);
  useEffect(refresh, [refresh]);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-semibold">{t('settings.storage')}</h2>
      <div className="flex items-center justify-between gap-4 rounded-2xl border border-border/50 bg-bg-elevated px-4 py-3">
        <div>
          <div className="text-sm font-medium">{t('settings.artworkCache')}</div>
          <div className="text-xs text-fg-muted">
            {t('settings.artworkCacheHint', {
              count: stats?.count ?? 0,
              size: megabytes(stats?.bytes ?? 0, locale),
              max: megabytes(MAX_CACHE_BYTES, locale, 0),
            })}
          </div>
        </div>
        <Button
          disabled={!stats?.count}
          onClick={() => {
            void clearArtworkCache().then(() => {
              refresh();
              toast(t('settings.artworkCacheCleared'));
            });
          }}
        >
          {t('settings.artworkCacheClear')}
        </Button>
      </div>
    </section>
  );
}
