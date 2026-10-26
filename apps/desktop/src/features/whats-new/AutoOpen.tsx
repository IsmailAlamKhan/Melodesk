import { getVersion } from '@tauri-apps/api/app';
import { useEffect } from 'react';
import { kvGet, kvSet } from '../../data/kv';
import { db } from '../../data/persister';
import { releasesSince } from './logic';
import { RELEASES } from './releases';
import { useWhatsNew } from './store';

const SEEN_KEY = 'whats-new:seen';
/** The last version before this window existed: whoever already used the app has seen nothing after it. */
const BEFORE_THIS_WINDOW = '0.7.0';

/** A first run ever: nothing dismissed, nothing listened to yet. The new-user tips cover that. */
async function isFreshInstall(): Promise<boolean> {
  try {
    if ((await kvGet('first-run:dismissed')) !== null) return false;
    const rows = await (await db()).select<{ n: number }[]>('SELECT COUNT(*) AS n FROM history');
    return (rows[0]?.n ?? 0) === 0;
  } catch {
    return false;
  }
}

/**
 * Opens the window once after an update. The version last run is kept on this computer. Someone who
 * used the app before this window existed has no such note: they are taken to have last run the
 * version before it, so they see what came since. A first run ever only notes the version.
 */
export function AutoOpen() {
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const current = await getVersion().catch(() => null);
      if (!current || cancelled) return;
      let seen = await kvGet(SEEN_KEY).catch(() => null);
      if (cancelled) return;
      if (seen === null) {
        if (await isFreshInstall()) {
          await kvSet(SEEN_KEY, current).catch(() => undefined);
          return;
        }
        seen = BEFORE_THIS_WINDOW;
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
