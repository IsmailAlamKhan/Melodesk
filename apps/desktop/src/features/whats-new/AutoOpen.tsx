import { getVersion } from '@tauri-apps/api/app';
import { useEffect } from 'react';
import { kvGet, kvSet } from '../../data/kv';
import { releasesSince } from './logic';
import { RELEASES } from './releases';
import { useWhatsNew } from './store';

const SEEN_KEY = 'whats-new:seen';

/**
 * Opens the window once after an update. The version last run is kept on this computer; a first run
 * ever has nothing to compare with, so it only notes the version (the new-user tips cover that).
 */
export function AutoOpen() {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const current = await getVersion().catch(() => null);
      if (!current || cancelled) return;
      const seen = await kvGet(SEEN_KEY).catch(() => null);
      if (cancelled) return;
      if (seen === null) {
        await kvSet(SEEN_KEY, current).catch(() => undefined);
        return;
      }
      if (seen === current) return;
      const news = releasesSince(RELEASES, seen, current);
      // Remember it now: a window that was shown is not shown again, even if the app closes first.
      await kvSet(SEEN_KEY, current).catch(() => undefined);
      if (news.length > 0 && !cancelled) useWhatsNew.getState().show(news, true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
}
