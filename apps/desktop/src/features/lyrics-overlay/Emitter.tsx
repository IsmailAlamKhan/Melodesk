import { emit, listen } from '@tauri-apps/api/event';
import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../../player/store';
import { usePositionMs } from '../../player/usePositionMs';
import { useTrackLyrics } from '../lyrics/useTrackLyrics';
import {
  EMPTY_LINE,
  LINE_EVENT,
  REQUEST_EVENT,
  linesAt,
  sameLine,
  type OverlayLine,
} from './protocol';
import { useOverlay } from './store';

/** Runs in the main window while the overlay is open: tells it which line is being sung. */
export function OverlayEmitter() {
  const open = useOverlay((s) => s.open);
  if (!open) return null;
  return <Feed />;
}

function Feed() {
  const track = usePlayerStore((s) => s.track);
  const { rows, texts, hasTimed, activeAt, lyrics } = useTrackLyrics();
  const positionMs = usePositionMs(120);
  const last = useRef<OverlayLine>(EMPTY_LINE);
  const wanted = useRef(true);

  const active = hasTimed ? activeAt(positionMs) : -1;
  const shown = linesAt(texts, active);
  const has = rows.length > 0;
  const payload: OverlayLine = {
    title: track?.title ?? '',
    artist: (track?.artist ?? '').split(' • ')[0] ?? '',
    // Untimed lyrics cannot follow the music, so no line is claimed for them.
    line: hasTimed ? shown.line : '',
    next: hasTimed ? shown.next : '',
    timed: hasTimed,
    hasLyrics: has || lyrics.isLoading,
  };

  const send = (p: OverlayLine): void => {
    last.current = p;
    void emit(LINE_EVENT, p);
  };
  useEffect(() => {
    if (wanted.current && sameLine(last.current, payload)) return;
    wanted.current = false;
    send(payload);
  });
  useEffect(() => {
    // A window that opens late asks for the line it missed.
    let off: (() => void) | undefined;
    void listen(REQUEST_EVENT, () => {
      send(last.current);
    }).then((u) => {
      off = u;
    });
    return () => {
      off?.();
    };
  }, []);
  return null;
}
