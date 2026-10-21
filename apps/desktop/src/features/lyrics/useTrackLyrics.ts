import { useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import type { PluginTrack } from '@melodesk/plugins';
import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { fetchLyrics } from '../../data/innertube';
import {
  loadLyricsOverride,
  saveLyricsOverride,
  type LyricsOverride,
} from '../../data/lyricsOverride';
import { nextQuery } from '../../player/nextInfo';
import { usePlayerStore } from '../../player/store';
import { lyricsSources, type LyricsSource } from '../../core';
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
  /** The listener's own answer to "which song is this?", if they gave one. */
  override: LyricsOverride | null;
  setOverride: (value: LyricsOverride | null) => void;
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
/** The first lyrics, in registration order, from the sources the user has turned on. */
async function fromSources(
  sources: readonly LyricsSource[],
  track: PluginTrack,
): Promise<Awaited<ReturnType<LyricsSource['fetch']>>> {
  for (const source of sources) {
    if (!source.isActive()) continue;
    try {
      const result = await source.fetch(track);
      if (result) return result;
    } catch (err) {
      console.warn(`[lyrics:${source.id}] failed`, err);
    }
  }
  return null;
}

export function useTrackLyrics(): TrackLyrics {
  const videoId = usePlayerStore((s) => s.track?.videoId ?? null);
  const ready = usePlayerStore((s) => s.ready);
  const qc = useQueryClient();
  const prefs = useLyricsPrefs();
  const sources = lyricsSources.useAll();
  const timedSource = sources.find((s) => s.id === 'lrclib') ?? null;
  const subscribeTimed = useCallback(
    (onChange: () => void) => timedSource?.subscribe(onChange) ?? (() => undefined),
    [timedSource],
  );
  const lrclibOn = useSyncExternalStore(subscribeTimed, () => timedSource?.isActive() ?? false);

  const overrideQuery = useQuery({
    queryKey: ['lyrics-override', videoId],
    enabled: videoId !== null,
    staleTime: Infinity,
    queryFn: () => loadLyricsOverride(videoId ?? ''),
  });
  const override = overrideQuery.data ?? null;
  const setOverride = (value: LyricsOverride | null): void => {
    if (!videoId) return;
    qc.setQueryData(['lyrics-override', videoId], value);
    void saveLyricsOverride(videoId, value);
  };

  const lyrics = useQuery<LyricsData>({
    queryKey: ['lyrics', videoId, lrclibOn, override?.title ?? '', override?.artist ?? ''],
    enabled: ready && videoId !== null && !overrideQuery.isPending,
    staleTime: 1000 * 60 * 60,
    queryFn: async () => {
      const next = await qc.query(nextQuery(videoId));
      const own = next.lyricsBrowseId
        ? await fetchLyrics(next.lyricsBrowseId)
        : { text: null, source: null, synced: null };
      if (own.synced) return { ...own, origin: 'youtube' as const };
      // YouTube's web lyrics are usually untimed. If LRCLIB is on, prefer its timed lyrics.
      const t = usePlayerStore.getState().track;
      const st = usePlayerStore.getState().state;
      const plugin =
        t?.videoId && sources.some((s) => s.isActive())
          ? await fromSources(sources, {
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
    override,
    setOverride,
    prefs,
    romanized,
    translated,
    caveat,
    activeAt: (positionMs) => (hasTimed ? activeIndex(rows, positionMs, offsetMs) : -1),
  };
}
