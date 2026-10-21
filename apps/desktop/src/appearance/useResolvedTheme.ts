import { useEffect, useState } from 'react';
import { resolveTheme, type ResolvedTheme } from './apply';
import { useAppearance } from './store';

/** The theme in effect (light, dark or AMOLED), following the system when the user says "system". */
export function useResolvedTheme(): ResolvedTheme {
  const mode = useAppearance((s) => s.theme);
  const [light, setLight] = useState(
    () => window.matchMedia('(prefers-color-scheme: light)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const on = (e: MediaQueryListEvent): void => setLight(e.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return resolveTheme(mode, light);
}
