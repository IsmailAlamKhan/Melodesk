import { Tooltip, cn } from '@melodesk/ui';
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

const PX_PER_SECOND = 45;

/**
 * One line of text that never gets cut off for good. If it does not fit it fades out at the end,
 * shows the whole text in a tooltip, and slides to its end and back while you hover over it (or
 * over the row it is in). Under "reduce motion" it only keeps the tooltip.
 */
export function Marquee({
  children,
  label,
  className,
}: {
  children: ReactNode;
  /** The text as a string, for the tooltip. */
  label: string;
  className?: string;
}) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);

  useLayoutEffect(() => {
    const measure = (): void => {
      const o = outer.current;
      const i = inner.current;
      if (o && i) setOverflow(Math.max(0, Math.ceil(i.scrollWidth - o.clientWidth)));
    };
    measure();
    const observer = new ResizeObserver(measure);
    if (outer.current) observer.observe(outer.current);
    if (inner.current) observer.observe(inner.current);
    return () => observer.disconnect();
  }, [label]);

  const line = (
    <div
      ref={outer}
      data-overflow={overflow > 0}
      className={cn('marquee overflow-hidden whitespace-nowrap', className)}
      style={
        {
          '--marquee-shift': `${String(-overflow)}px`,
          '--marquee-dur': `${String(Math.max(2.5, overflow / PX_PER_SECOND + 1.5))}s`,
        } as CSSProperties
      }
    >
      <span ref={inner} className="marquee-track inline-block">
        {children}
      </span>
    </div>
  );
  return overflow > 0 ? <Tooltip label={label}>{line}</Tooltip> : line;
}
