import { cn } from '@melodesk/ui';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useArtworkColor } from '../../appearance/artworkAccent';
import { toHex } from '../../appearance/color';
import { colorVars } from '../../appearance/material';
import { useAppearance } from '../../appearance/store';
import { useResolvedTheme } from '../../appearance/useResolvedTheme';

/**
 * Gives everything inside it the Material colour scheme of an image: the page of an artist, album
 * or playlist takes the colours of its artwork or banner, and fades back to the app's colours when
 * you leave. The colours are CSS variables on this element only, so the sidebar and player bar keep
 * the user's own. Falls back to the app's colours while the image is loading, when it is grey, and
 * when the user turned this off in Settings.
 */
export function ThemedScope({
  artworkUrl,
  className,
  children,
}: {
  artworkUrl: string | null;
  className?: string;
  children: ReactNode;
}) {
  const enabled = useAppearance((s) => s.pageColors);
  const contrast = useAppearance((s) => s.contrast);
  const theme = useResolvedTheme();
  const rgb = useArtworkColor(enabled ? artworkUrl : null);
  const vars = useMemo(
    () => (rgb ? (colorVars(toHex(rgb), theme, contrast, 'content') as CSSProperties) : null),
    [rgb, theme, contrast],
  );
  // Apply the scheme one frame after the element exists, so it fades in from the app's colours
  // instead of appearing already tinted.
  const [applied, setApplied] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setApplied(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div
      data-themed={vars && applied ? 'true' : 'false'}
      className={cn('themed-scope min-h-full bg-bg text-fg', className)}
      style={vars && applied ? vars : undefined}
    >
      {children}
    </div>
  );
}
