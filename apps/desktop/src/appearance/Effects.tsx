import { TooltipProvider } from '@melodesk/ui';
import { DirectionProvider } from '@radix-ui/react-direction';
import { MotionConfig } from 'framer-motion';
import { useEffect, useState, type ReactNode } from 'react';
import { usePlayerStore } from '../player/store';
import { applyToDocument, cacheVars, resolveDirection, resolveTheme, schemeVars } from './apply';
import { DEFAULT_SEED, seedFor } from './material';
import { useArtworkColor } from './artworkAccent';
import { MIRROR_KEY, useAppearance } from './store';
import { invoke } from '@tauri-apps/api/core';
import { t, useResolvedLocale } from '../i18n';

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

  // The tray and the macOS Playback menu are native, so they get their text from here.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('window') !== null) return;
    void invoke('set_native_labels', {
      labels: {
        play: t('native.play'),
        pause: t('native.pause'),
        next: t('native.next'),
        previous: t('native.previous'),
        show: t('native.show'),
        quit: t('native.quit'),
        nothingPlaying: t('native.nothingPlaying'),
        playback: t('native.playback'),
        about: t('native.about'),
      },
    }).catch(() => undefined);
  }, [locale]);

  useEffect(() => {
    const theme = resolveTheme(prefs.theme, light);
    const vars = schemeVars(prefs, theme, artRgb);
    applyToDocument({
      theme,
      density: prefs.density,
      dir: resolveDirection(prefs.direction, locale),
      lang: locale,
      vars,
    });
    cacheVars(
      theme,
      vars,
      seedFor(prefs.accent, artRgb) === DEFAULT_SEED && prefs.contrast === 'standard',
    );
  }, [prefs, light, locale, artRgb]);

  // Respect the OS "reduce motion" setting for every Framer Motion animation.
  return (
    <DirectionProvider dir={resolveDirection(prefs.direction, locale)}>
      <MotionConfig reducedMotion="user">
        <TooltipProvider>{children}</TooltipProvider>
      </MotionConfig>
    </DirectionProvider>
  );
}
