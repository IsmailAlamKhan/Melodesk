import { cn } from '@melodesk/ui';
import { useRef } from 'react';
import { useLevelVars } from '../../core';

/**
 * A soft coloured glow behind something (a cover) that swells with the bass and brightens with the
 * loudness. Only this element's opacity and scale change, so it costs the compositor, not a repaint
 * of what is around it. Fixed and faint when the music visuals are off.
 */
export function BeatGlow({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLevelVars(ref);
  return (
    <span
      ref={ref}
      aria-hidden
      className={cn(
        'pointer-events-none absolute -inset-2 -z-10 rounded-2xl bg-[var(--bar-tint,var(--color-accent))] opacity-[calc(0.12+var(--energy,0)*0.6)] blur-xl will-change-[transform,opacity] [transform:scale(calc(0.92+var(--bass,0)*0.22))]',
        className,
      )}
    />
  );
}
