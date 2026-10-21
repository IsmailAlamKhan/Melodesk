import { cn } from '@melodesk/ui';
import { useRef } from 'react';
import { useLevelVars } from '../../core';

/**
 * A few bars that rise and fall with the music, like an equalizer icon. They hold at a resting
 * height when the music visuals are off or nothing is playing.
 */
export function LiveBars({ bars = 4, className }: { bars?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useLevelVars(ref, bars);
  return (
    <span ref={ref} aria-hidden className={cn('flex h-3 items-end gap-px', className)}>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className="h-full w-0.5 origin-bottom rounded-full bg-current transition-transform duration-75"
          style={{ transform: `scaleY(clamp(0.25, var(--b${String(i)}, 0.45) * 1.6, 1))` }}
        />
      ))}
    </span>
  );
}
