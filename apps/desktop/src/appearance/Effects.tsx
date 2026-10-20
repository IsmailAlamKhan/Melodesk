import { DirectionProvider } from '@radix-ui/react-direction';
import { MotionConfig } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { usePlayerStore } from '../player/store';
import { accentVars, applyToDocument, resolveDirection, resolveTheme } from './apply';
import { useArtworkColor } from './artworkAccent';
import { MIRROR_KEY, useAppearance } from './store';
import { useResolvedLocale } from '../i18n';

/** Applies the appearance preferences to <html> and keeps them in step across windows. */
export function AppearanceEffects({ children }: { children: ReactNode }) {
  const prefs = useAppearance();
  const locale = useResolvedLocale();
  const artwork = usePlayerStore((s) => s.track?.artworkUrl ?? null);
  const artRgb = useArtworkColor(prefs.accent.kind === 'art' ? artwork : null);
  const [light, setLight] = useState(
    () => window.matchMedia('(prefers-color-scheme: light)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const on = (e: MediaQueryListEvent): void => setLight(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    void useAppearance.getState().load();
    const onStorage = (e: StorageEvent): void => {
      if (e.key === MIRROR_KEY) useAppearance.getState().syncFromMirror();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const theme = resolveTheme(prefs.theme, light);
    applyToDocument({
      theme,
      density: prefs.density,
      dir: resolveDirection(prefs.direction, locale),
      lang: locale,
      accent: accentVars(prefs, theme, artRgb),
    });
  }, [prefs, light, locale, artRgb]);

  // Respect the OS "reduce motion" setting for every Framer Motion animation.
  return (
    <DirectionProvider dir={resolveDirection(prefs.direction, locale)}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </DirectionProvider>
  );
}
