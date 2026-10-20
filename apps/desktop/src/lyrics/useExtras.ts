import { useQuery } from '@tanstack/react-query';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { kvGet, kvSet } from '../data/kv';
import { useLyricsPrefs } from './prefs';
import { hashLines } from './rows';
import { transliterateLines } from './transliterate';
import { translateLines, type Fetcher } from './translate';

const fetcher: Fetcher = async (url, init) => {
  const res = await tauriFetch(url, {
    method: init?.method ?? 'GET',
    ...(init?.headers ? { headers: init.headers } : {}),
    ...(init?.body !== undefined ? { body: init.body } : {}),
  });
  return { ok: res.ok, status: res.status, json: () => res.json() as Promise<unknown> };
};

export function useRomanized(lines: string[], enabled: boolean) {
  return useQuery({
    queryKey: ['romanize', hashLines(lines)],
    enabled: enabled && lines.length > 0,
    staleTime: Infinity,
    queryFn: () => transliterateLines(lines),
  });
}

/** Translation of the given lines; results are cached locally so a song is requested only once. */
export function useTranslated(videoId: string | null, lines: string[], enabled: boolean) {
  const p = useLyricsPrefs();
  const allowed = p.provider === 'libretranslate' || p.translationConsent;
  const key = [
    'translate',
    videoId,
    hashLines(lines),
    p.provider,
    p.source,
    p.target,
    p.libreUrl,
  ] as const;
  return useQuery({
    queryKey: key,
    enabled: enabled && allowed && lines.length > 0,
    staleTime: Infinity,
    retry: false,
    queryFn: async () => {
      const cacheKey = `lyrics:tr:${key.slice(2).join('|')}`;
      const cached = await kvGet(cacheKey);
      if (cached) return JSON.parse(cached) as string[];
      const out = await translateLines(
        lines,
        {
          provider: p.provider,
          target: p.target,
          source: p.source,
          libreUrl: p.libreUrl,
          libreKey: p.libreKey,
        },
        fetcher,
      );
      await kvSet(cacheKey, JSON.stringify(out));
      return out;
    },
  });
}
