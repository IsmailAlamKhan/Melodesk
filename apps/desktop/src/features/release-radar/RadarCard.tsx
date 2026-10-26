import { IconButton } from '@melodesk/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Disc3, X } from 'lucide-react';
import { useNavigate } from 'react-router';
import { infoSources, useSourceActive } from '../../core';
import { useT } from '../../i18n/index';
import { dismiss, isDismissed, releases } from './radar';

/** "New from artists you play": recent albums, EPs and singles, once the user allows the lookup. */
export function RadarCard() {
  const t = useT();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const source = infoSources.useAll()[0];
  const on = useSourceActive(source);
  const hidden = useQuery({
    queryKey: ['radar-dismissed'],
    queryFn: isDismissed,
    staleTime: Infinity,
  });
  const list = useQuery({
    queryKey: ['radar'],
    enabled: on && !!source,
    staleTime: 60 * 60_000,
    queryFn: () => (source ? releases(source.newReleases) : []),
  });
  if (!source) return null;
  if (!on) {
    if (hidden.data !== false) return null;
    return (
      <div className="flex items-start gap-3 rounded-2xl border border-border/50 bg-bg-elevated p-3">
        <Disc3 className="mt-0.5 size-5 shrink-0 text-fg-subtle" />
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-medium">{t('radar.title')}</div>
          <p className="mt-0.5 text-xs text-fg-muted">{t('radar.optIn', { name: source.label })}</p>
          <button
            type="button"
            onClick={() => {
              source.activate();
            }}
            className="mt-2 h-8 rounded-md bg-fg px-3 text-xs font-medium text-bg hover:opacity-90"
          >
            {t('songInfo.enable', { name: source.label })}
          </button>
        </div>
        <IconButton
          label={t('radar.dismiss')}
          onClick={() => {
            void dismiss().then(() => qc.setQueryData(['radar-dismissed'], true));
          }}
        >
          <X className="size-4" />
        </IconButton>
      </div>
    );
  }
  const items = (list.data ?? []).slice(0, 6);
  if (list.isLoading)
    return (
      <div className="rounded-2xl border border-border/50 bg-bg-elevated p-3 text-xs text-fg-muted">
        {t('radar.loading')}
      </div>
    );
  if (items.length === 0) return null;
  return (
    <div className="rounded-2xl border border-border/50 bg-bg-elevated p-3">
      <div className="flex items-center gap-2 text-sm font-medium">
        <Disc3 className="size-4 text-accent" />
        {t('radar.title')}
      </div>
      <ul className="mt-2 flex flex-col">
        {items.map((r) => (
          <li key={r.url}>
            <button
              type="button"
              className="flex w-full items-baseline gap-2 rounded-md px-2 py-1.5 text-start text-sm hover:bg-bg-overlay"
              onClick={() => {
                void navigate(`/search?q=${encodeURIComponent(`${r.artist} ${r.title}`)}`);
              }}
            >
              <span className="min-w-0 flex-1 truncate">
                <span className="font-medium">{r.title}</span>
                <span className="text-fg-muted"> · {r.artist}</span>
              </span>
              <span className="shrink-0 text-xs text-fg-subtle">
                {r.kind} · {r.date}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
