import { cn } from '@melodesk/ui';
import { Check, Loader2, Minus, TriangleAlert } from 'lucide-react';
import { useLyricsProgress, type LyricsStep } from '../../core';
import { useT } from '../../i18n/index';

/** What the lookup is doing right now: each place it asks, and how that went. */
export function LyricsProgress({
  videoId,
  className,
}: {
  videoId: string | null;
  className?: string;
}) {
  const t = useT();
  const progress = useLyricsProgress();
  const steps = progress.videoId === videoId ? progress.steps : [];

  const name = (s: LyricsStep): string =>
    s.id === 'youtube' ? t('lyrics.step.youtube') : s.id === 'ai' ? t('lyrics.step.ai') : s.label;
  const note = (s: LyricsStep): string => {
    if (s.id === 'ai' && s.state === 'found' && s.detail)
      return t('lyrics.step.aiFound', { titles: s.detail });
    if (s.state === 'running')
      return s.detail ? t('lyrics.step.trying', { title: s.detail }) : t('lyrics.step.running');
    return t(`lyrics.step.${s.state === 'failed' ? 'none' : s.state}`);
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn('flex flex-col gap-3 text-sm text-fg-muted', className)}
    >
      <div className="font-medium text-fg">{t('lyrics.searching')}</div>
      <ul className="flex flex-col gap-2">
        {steps.map((s) => (
          <li key={s.id} className="flex items-start gap-2.5">
            <span className="mt-0.5 shrink-0" aria-hidden>
              {s.state === 'running' ? (
                <Loader2 className="size-4 animate-spin motion-reduce:animate-none" />
              ) : s.state === 'found' ? (
                <Check className="size-4 text-accent" />
              ) : s.state === 'slow' || s.state === 'failed' ? (
                <TriangleAlert className="size-4" />
              ) : (
                <Minus className="size-4 text-fg-subtle" />
              )}
            </span>
            <span className="min-w-0">
              <span className={cn(s.state === 'running' && 'text-fg')}>{name(s)}</span>
              <span className="block truncate text-xs text-fg-subtle">{note(s)}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
