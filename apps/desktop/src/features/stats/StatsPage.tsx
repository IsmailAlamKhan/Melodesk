import { cn } from '@melodesk/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { formatDurationLocale, intlLocale, useI18n, useT, type MessageKey } from '../../i18n/index';
import { loadStats, type StatsRange, type TopEntry } from './queries';
import { playEndpoint } from '../../player/actions';
import { useNavigate } from 'react-router';
import { Img } from '../../core';

const RANGES: { key: StatsRange; labelKey: MessageKey }[] = [
  { key: 'week', labelKey: 'stats.range.week' },
  { key: 'month', labelKey: 'stats.range.month' },
  { key: 'year', labelKey: 'stats.range.year' },
  { key: 'all', labelKey: 'stats.range.all' },
];

function useFormatDuration(): (seconds: number) => string {
  const locale = useI18n((s) => s.locale);
  return (seconds) => formatDurationLocale(seconds, locale);
}

/** Listening stats computed locally from the SQLite history. Nothing is uploaded. */
export function StatsPage() {
  const t = useT();
  const fd = useFormatDuration();
  const locale = useI18n((s) => s.locale);
  const [range, setRange] = useState<StatsRange>('week');
  const q = useQuery({
    queryKey: ['stats', range],
    queryFn: () => loadStats(range),
    staleTime: 30_000,
  });
  const navigate = useNavigate();
  const s = q.data;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 p-4 md:p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">{t('stats.title')}</h1>
          <p className="text-sm text-fg-muted">{t('stats.subtitle')}</p>
        </div>
        <div
          role="tablist"
          className="flex gap-1 rounded-full border border-border bg-bg-elevated p-1"
        >
          {RANGES.map((r) => (
            <button
              key={r.key}
              role="tab"
              type="button"
              aria-selected={range === r.key}
              onClick={() => setRange(r.key)}
              className={cn(
                'rounded-full px-3 py-1 text-sm',
                range === r.key ? 'bg-fg text-bg' : 'text-fg-muted hover:text-fg',
              )}
            >
              {t(r.labelKey)}
            </button>
          ))}
        </div>
      </header>

      {s && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label={t('stats.listeningTime')} value={fd(s.totalSeconds)} />
            <Stat label={t('stats.playsLabel')} value={String(s.plays)} />
            <Stat label={t('stats.differentSongs')} value={String(s.uniqueTracks)} />
            <Stat label={t('stats.differentArtists')} value={String(s.uniqueArtists)} />
          </section>

          {range === 'week' && s.totalSeconds > 0 && (
            <section className="rounded-xl border border-border bg-gradient-to-br from-accent/20 to-bg-elevated p-6">
              <div className="text-xs font-medium tracking-wide text-fg-subtle uppercase">
                {t('stats.yourWeek')}
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">
                {s.topArtists[0]
                  ? t('stats.recap.artist', {
                      time: fd(s.totalSeconds),
                      artist: s.topArtists[0].label,
                    })
                  : t('stats.recap', { time: fd(s.totalSeconds) })}
                {s.topTracks[0]
                  ? ` ${t('stats.recap.track', { track: s.topTracks[0].label, count: s.topTracks[0].plays })}`
                  : ''}
              </p>
            </section>
          )}

          <section className="grid gap-8 md:grid-cols-2">
            <TopList
              title={t('stats.topSongs')}
              entries={s.topTracks}
              onOpen={(e) => void playEndpoint({ type: 'watch', videoId: e.key })}
            />
            <TopList
              title={t('stats.topArtists')}
              entries={s.topArtists}
              onOpen={(e) => void navigate(`/search?q=${encodeURIComponent(e.label)}`)}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">{t('stats.byDay')}</h2>
            <BarChart
              values={s.days.map((d) => d.seconds)}
              labels={s.days.map((d) => dayLabel(d.day, locale))}
            />
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">{t('stats.byHour')}</h2>
            <BarChart
              values={s.hours}
              labels={s.hours.map((_, i) => (i % 6 === 0 ? hourLabel(i, locale) : ''))}
            />
          </section>
          {s.plays === 0 && <p className="text-sm text-fg-muted">{t('stats.empty')}</p>}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-border/50 bg-bg-elevated p-4">
      <div className="text-xs text-fg-subtle">{label}</div>
      <div className="mt-1 font-display text-2xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

function TopList({
  title,
  entries,
  onOpen,
}: {
  title: string;
  entries: TopEntry[];
  onOpen: (e: TopEntry) => void;
}) {
  const t = useT();
  const fd = useFormatDuration();
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-semibold">{title}</h2>
      {!entries.length && <div className="text-sm text-fg-subtle">{t('stats.nothingYet')}</div>}
      <ol className="flex flex-col">
        {entries.map((e, i) => (
          <li key={e.key}>
            <button
              type="button"
              onClick={() => onOpen(e)}
              className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-start hover:bg-bg-overlay"
            >
              <span className="w-5 text-xs tabular-nums text-fg-subtle">{i + 1}</span>
              {e.artworkUrl ? (
                <Img src={e.artworkUrl} alt="" className="size-9 rounded-sm object-cover" />
              ) : (
                <span className="size-9 rounded-sm bg-bg-overlay" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{e.label}</span>
                {e.sublabel && (
                  <span className="block truncate text-xs text-fg-muted">{e.sublabel}</span>
                )}
              </span>
              <span className="text-xs tabular-nums text-fg-subtle">
                {t('stats.entryMeta', {
                  plays: t('stats.plays', { count: e.plays }),
                  duration: fd(e.seconds),
                })}
              </span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Dependency-free bar chart; values in seconds. */
function BarChart({ values, labels }: { values: number[]; labels: string[] }) {
  const t = useT();
  const fd = useFormatDuration();
  const max = Math.max(1, ...values);
  const w = 600;
  const h = 120;
  const n = Math.max(1, values.length);
  const bw = w / n;
  return (
    <svg
      viewBox={`0 0 ${String(w)} ${String(h + 18)}`}
      role="img"
      aria-label={t('stats.chart')}
      className="w-full text-accent"
    >
      {values.map((v, i) => {
        const bh = (v / max) * h;
        return (
          <g key={i}>
            <rect
              x={i * bw + 1}
              y={h - bh}
              width={Math.max(1, bw - 2)}
              height={bh}
              rx={2}
              fill="currentColor"
              opacity={0.85}
            >
              <title>{`${labels[i] ?? ''}: ${fd(v)}`}</title>
            </rect>
            {labels[i] && n <= 31 && (
              <text
                x={i * bw + bw / 2}
                y={h + 14}
                textAnchor="middle"
                fontSize={9}
                fill="var(--color-fg-subtle)"
              >
                {labels[i]}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

function dayLabel(day: string, locale: string): string {
  const d = new Date(`${day}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? day
    : new Intl.DateTimeFormat(intlLocale(locale), { month: 'short', day: 'numeric' }).format(d);
}

function hourLabel(hour: number, locale: string): string {
  return new Intl.DateTimeFormat(intlLocale(locale), { hour: 'numeric' }).format(
    new Date(2000, 0, 1, hour),
  );
}
