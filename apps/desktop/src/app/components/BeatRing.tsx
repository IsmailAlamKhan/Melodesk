import { cn } from '@melodesk/ui';
import { useRef } from 'react';
import { useLevelVars } from '../../core';

/**
 * A ring that flares behind a round button (play/pause) on every beat. Put it inside a `relative`
 * wrapper around the button. Invisible when the music visuals are off or nothing is playing.
 */
export function BeatRing({ className }: { className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLevelVars(ref);
  return (
    <span
      ref={ref}
      aria-hidden
      className={cn(
        'pointer-events-none absolute inset-0 rounded-full bg-[var(--np-accent,var(--color-accent))] opacity-[calc(var(--beat,0)*0.45)] will-change-[transform,opacity] [transform:scale(calc(1+var(--beat,0)*0.4))]',
        className,
      )}
    />
  );
}
