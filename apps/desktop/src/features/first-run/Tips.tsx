import { IconButton } from '@melodesk/ui';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AudioLines, Command, MousePointerClick, Puzzle, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { kvGet, kvSet } from '../../data/kv';
import { useT, type MessageKey } from '../../i18n/index';

const KEY = 'first-run:dismissed';

const mod = (): string =>
  document.documentElement.dataset['platform'] === 'macos' ? '⌘' : 'Ctrl+';

const TIPS: { icon: ReactNode; title: MessageKey; body: MessageKey }[] = [
  { icon: <Command className="size-5" />, title: 'tips.palette.title', body: 'tips.palette.body' },
  {
    icon: <MousePointerClick className="size-5" />,
    title: 'tips.context.title',
    body: 'tips.context.body',
  },
  {
    icon: <AudioLines className="size-5" />,
    title: 'tips.nowPlaying.title',
    body: 'tips.nowPlaying.body',
  },
  { icon: <Puzzle className="size-5" />, title: 'tips.features.title', body: 'tips.features.body' },
];

/** Four things worth knowing, once. */
export function Tips() {
  const t = useT();
  const qc = useQueryClient();
  const { data: dismissed } = useQuery({
    queryKey: ['first-run'],
    staleTime: Infinity,
    queryFn: async () => (await kvGet(KEY).catch(() => null)) === '1',
  });
  if (dismissed !== false) return null;
  return (
    <section
      aria-label={t('tips.title')}
      className="rounded-2xl border border-border/50 bg-gradient-to-br from-accent-soft to-bg-elevated p-4"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">{t('tips.title')}</h2>
          <p className="text-sm text-fg-muted">{t('tips.intro')}</p>
        </div>
        <IconButton
          label={t('tips.dismiss')}
          size="sm"
          onClick={() => {
            void kvSet(KEY, '1').catch(() => undefined);
            qc.setQueryData(['first-run'], true);
          }}
        >
          <X />
        </IconButton>
      </div>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {TIPS.map((tip) => (
          <li key={tip.title} className="flex gap-3 rounded-xl bg-bg/40 p-3">
            <span className="mt-0.5 text-accent">{tip.icon}</span>
            <span className="min-w-0 text-sm">
              <span className="block font-medium">{t(tip.title)}</span>
              <span className="block text-xs text-fg-muted">{t(tip.body, { mod: mod() })}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
