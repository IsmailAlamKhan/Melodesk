import { cn } from '@melodesk/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { formatDuration, loadStats, type StatsRange, type TopEntry } from '../../stats/queries';
import { playEndpoint } from '../../player/actions';
import { useNavigate } from 'react-router';

const RANGES: { key: StatsRange; label: string }[] = [
  { key: 'week', label: 'This week' },
  { key: 'month', label: '30 days' },
  { key: 'year', label: 'Year' },
  { key: 'all', label: 'All time' },
];

/** Listening stats computed locally from the SQLite history. Nothing is uploaded. */
export function StatsPage() {
  const [range, setRange] = useState<StatsRange>('week');
  const q = useQuery({
    queryKey: ['stats', range],
    queryFn: () => loadStats(range),
    staleTime: 30_000,
  });
  const navigate = useNavigate();
  const s = q.data;
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 p-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight">Your listening</h1>
          <p className="text-sm text-fg-muted">
            Computed on this computer from what Melodesk played. Never uploaded.
          </p>
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
              {r.label}
            </button>
          ))}
        </div>
      </header>

      {s && (
        <>
          <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat label="Listening time" value={formatDuration(s.totalSeconds)} />
            <Stat label="Plays" value={String(s.plays)} />
            <Stat label="Different songs" value={String(s.uniqueTracks)} />
            <Stat label="Different artists" value={String(s.uniqueArtists)} />
          </section>

          {range === 'week' && s.totalSeconds > 0 && (
            <section className="rounded-xl border border-border bg-gradient-to-br from-accent/20 to-bg-elevated p-6">
              <div className="text-xs font-medium tracking-wide text-fg-subtle uppercase">
                Your week
              </div>
              <p className="mt-2 font-display text-2xl font-semibold">
                You listened for {formatDuration(s.totalSeconds)}
                {s.topArtists[0] ? `, mostly to ${s.topArtists[0].label}` : ''}
                {s.topTracks[0]
                  ? `. “${s.topTracks[0].label}” was on repeat (${String(s.topTracks[0].plays)} plays).`
                  : '.'}
              </p>
            </section>
          )}

          <section className="grid gap-8 md:grid-cols-2">
            <TopList
              title="Top songs"
              entries={s.topTracks}
              onOpen={(e) => void playEndpoint({ type: 'watch', videoId: e.key })}
            />
            <TopList
              title="Top artists"
              entries={s.topArtists}
              onOpen={(e) => void navigate(`/search?q=${encodeURIComponent(e.label)}`)}
            />
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">By day</h2>
            <BarChart
              values={s.days.map((d) => d.seconds)}
              labels={s.days.map((d) => d.day.slice(5))}
            />
          </section>
          <section className="flex flex-col gap-3">
            <h2 className="font-semibold">By hour of day</h2>
            <BarChart
              values={s.hours}
              labels={s.hours.map((_, i) => (i % 6 === 0 ? `${String(i)}h` : ''))}
            />
          </section>
          {s.plays === 0 && (
            <p className="text-sm text-fg-muted">
              Nothing recorded in this range yet. Play something and come back.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-4">
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
  return (
    <div className="flex flex-col gap-2">
      <h2 className="font-semibold">{title}</h2>
      {!entries.length && <div className="text-sm text-fg-subtle">Nothing yet</div>}
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
                <img src={e.artworkUrl} alt="" className="size-9 rounded-sm object-cover" />
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
                {String(e.plays)} plays · {formatDuration(e.seconds)}
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
  const max = Math.max(1, ...values);
  const w = 600;
  const h = 120;
  const n = Math.max(1, values.length);
  const bw = w / n;
  return (
    <svg
      viewBox={`0 0 ${String(w)} ${String(h + 18)}`}
      role="img"
      aria-label="Listening time chart"
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
              <title>{`${labels[i] ?? ''}: ${formatDuration(v)}`}</title>
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
