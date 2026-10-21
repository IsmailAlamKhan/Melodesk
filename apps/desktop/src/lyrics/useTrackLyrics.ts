import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useMemo } from 'react';
import { fetchLyrics, fetchNext } from '../data/innertube';
import { usePlayerStore } from '../player/store';
import { isPluginEnabled, lyricsFromPlugins, usePluginHost } from '../features/integrations/host';
import { loadOffset, saveOffset, useLyricsPrefs, type LyricsPrefs } from './prefs';
import { activeIndex, rowsFromLyrics, type LyricsData, type LyricsRow } from './rows';
import { transliterationCaveat, type Caveat } from './transliterate';
import { useRomanized, useTranslated } from './useExtras';

export interface TrackLyrics {
  videoId: string | null;
  lyrics: UseQueryResult<LyricsData>;
  rows: LyricsRow[];
  texts: string[];
  hasTimed: boolean;
  offsetMs: number;
  setOffset: (ms: number) => void;
  lrclibOn: boolean;
  prefs: LyricsPrefs;
  romanized: ReturnType<typeof useRomanized>;
  translated: ReturnType<typeof useTranslated>;
  caveat: Caveat;
  /** Active line index at `positionMs`, or -1. */
  activeAt: (positionMs: number) => number;
}

/**
 * Lyrics for the current track and everything that decorates them (timing offset, romanization,
 * translation). Shared by the side panel and karaoke mode so they always agree.
 */
export function useTrackLyrics(): TrackLyrics {
  const videoId = usePlayerStore((s) => s.track?.videoId ?? null);
  const ready = usePlayerStore((s) => s.ready);
  const qc = useQueryClient();
  const prefs = useLyricsPrefs();
  const lrclibOn = usePluginHost((s) =>
    s.plugins.some((p) => p.manifest.id === 'lrclib' && p.enabled),
  );

  const lyrics = useQuery<LyricsData>({
    queryKey: ['lyrics', videoId, lrclibOn],
    enabled: ready && videoId !== null,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const next = await fetchNext({ videoId: videoId ?? '' });
      const own = next.lyricsBrowseId
        ? await fetchLyrics(next.lyricsBrowseId)
        : { text: null, source: null, synced: null };
      if (own.synced) return { ...own, origin: 'youtube' as const };
      // YouTube's web lyrics are usually untimed. If LRCLIB is on, prefer its timed lyrics.
      const t = usePlayerStore.getState().track;
      const st = usePlayerStore.getState().state;
      const plugin =
        t?.videoId && isPluginEnabled('lrclib')
          ? await lyricsFromPlugins({
              videoId: t.videoId,
              title: t.title,
              artist: t.artist,
              album: t.album,
              artworkUrl: t.artworkUrl,
              durationSeconds: st?.duration ?? null,
            })
          : null;
      if (plugin?.synced)
        return {
          text: plugin.text,
          source: plugin.source,
          synced: plugin.synced,
          origin: 'plugin' as const,
        };
      if (own.text) return { ...own, origin: 'youtube' as const };
      if (plugin)
        return {
          text: plugin.text,
          source: plugin.source,
          synced: plugin.synced,
          origin: 'plugin' as const,
        };
      return { ...own, origin: 'youtube' as const };
    },
  });

  const offset = useQuery({
    queryKey: ['lyrics-offset', videoId],
    enabled: videoId !== null,
    staleTime: Infinity,
    queryFn: () => loadOffset(videoId ?? ''),
  });
  const offsetMs = offset.data ?? 0;
  const setOffset = (ms: number): void => {
    if (!videoId) return;
    qc.setQueryData(['lyrics-offset', videoId], ms);
    void saveOffset(videoId, ms);
  };

  const data = lyrics.data;
  const rows = useMemo(() => (data ? rowsFromLyrics(data) : []), [data]);
  const texts = useMemo(() => rows.map((r) => r.text), [rows]);
  const romanized = useRomanized(texts, prefs.romanize);
  const translated = useTranslated(videoId, texts, prefs.translate);
  const caveat = useMemo(() => transliterationCaveat(texts), [texts]);
  const hasTimed = !!data?.synced?.length;

  return {
    videoId,
    lyrics,
    rows,
    texts,
    hasTimed,
    offsetMs,
    setOffset,
    lrclibOn,
    prefs,
    romanized,
    translated,
    caveat,
    activeAt: (positionMs) => (hasTimed ? activeIndex(rows, positionMs, offsetMs) : -1),
  };
}
