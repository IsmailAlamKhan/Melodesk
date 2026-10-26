import { IconButton } from '@melodesk/ui';
import { emit, listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from '../../i18n/index';
import { CLOSED_EVENT, EMPTY_LINE, LINE_EVENT, REQUEST_EVENT, type OverlayLine } from './protocol';

const SHADOW = { textShadow: '0 1px 3px rgb(0 0 0 / 0.9), 0 0 14px rgb(0 0 0 / 0.7)' };

/** The floating lyrics window: the line being sung, big, over everything else. Drag it anywhere. */
export function OverlayWindow() {
  const t = useT();
  const [line, setLine] = useState<OverlayLine>(EMPTY_LINE);
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    document.body.style.background = 'transparent';
    let off: (() => void) | undefined;
    void listen<OverlayLine>(LINE_EVENT, (e) => {
      setLine(e.payload);
    }).then((u) => {
      off = u;
      void emit(REQUEST_EVENT);
    });
    // Tell the main window to stop feeding lines once this window goes away.
    let offClose: (() => void) | undefined;
    void getCurrentWindow()
      .onCloseRequested(() => {
        void emit(CLOSED_EVENT);
      })
      .then((u) => {
        offClose = u;
      });
    return () => {
      off?.();
      offClose?.();
    };
  }, []);

  const message = !line.title
    ? t('overlay.nothing')
    : !line.hasLyrics
      ? t('overlay.noLyrics')
      : !line.timed
        ? t('overlay.untimed')
        : null;
  return (
    <div
      data-tauri-drag-region
      className="group relative flex h-screen w-screen flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl px-8 text-center text-white select-none hover:bg-black/40"
    >
      <div className="pointer-events-none flex flex-col items-center gap-1" data-tauri-drag-region>
        {message ? (
          <p className="text-lg font-medium text-white/80" style={SHADOW}>
            {line.title ? `${line.title} — ${message}` : message}
          </p>
        ) : (
          <>
            <p
              className="font-display text-3xl leading-tight font-bold md:text-4xl"
              style={SHADOW}
              aria-live="polite"
            >
              {line.line || '♪'}
            </p>
            {line.next && (
              <p className="text-lg text-white/65" style={SHADOW}>
                {line.next}
              </p>
            )}
          </>
        )}
      </div>
      <div className="absolute end-2 top-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <IconButton
          label={t('overlay.close')}
          size="sm"
          onClick={() => {
            void getCurrentWindow().close();
          }}
        >
          <X />
        </IconButton>
      </div>
    </div>
  );
}
