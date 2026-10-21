import { cn } from '@melodesk/ui';
import { useEffect, useRef, useState } from 'react';
import { useT } from '../../i18n/index';
import { acceleratorFromEvent, shortcutProblem } from '../../settings/store';

/** Click, then press a combination. Esc (or a click elsewhere) cancels; Backspace clears. */
export function ShortcutField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const t = useT();
  const button = useRef<HTMLButtonElement>(null);
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  // The handler reads the latest props through a ref so the listeners below are added once per
  // recording rather than on every render.
  const handle = useRef<(e: KeyboardEvent) => void>(() => undefined);
  useEffect(() => {
    handle.current = (e) => {
      if (e.key === 'Escape') {
        setRecording(false);
      } else if (e.key === 'Backspace' || e.key === 'Delete') {
        setProblem(null);
        onChange(null);
        setRecording(false);
      } else {
        const combo = acceleratorFromEvent(e);
        if (!combo) return; // only modifiers so far: keep waiting
        const bad = shortcutProblem(combo);
        if (bad) {
          // Keep the old value; say why this one can't be a global shortcut.
          setProblem(t(`shortcut.err.${bad}` as const));
        } else {
          setProblem(null);
          onChange(combo);
        }
        setRecording(false);
      }
    };
  });

  // While recording, listen on the window rather than on the button: on macOS WebKit a click does
  // not focus a button, so keystrokes would never reach it (and it could never lose focus to cancel).
  useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent): void => {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) handle.current(e);
    };
    const onPointerDown = (e: PointerEvent): void => {
      if (!(e.target instanceof Node && button.current?.contains(e.target))) setRecording(false);
    };
    window.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      document.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [recording]);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        ref={button}
        type="button"
        aria-label={value ? t('shortcut.changeAria', { combo: value }) : t('shortcut.set')}
        onClick={() => {
          setProblem(null);
          setRecording((r) => !r);
          button.current?.focus();
        }}
        className={cn(
          'h-8 min-w-40 rounded-md border px-3 text-start font-mono text-xs',
          recording
            ? 'border-accent text-fg'
            : 'border-border bg-bg-elevated text-fg-muted hover:text-fg',
        )}
      >
        {recording
          ? t('shortcut.pressKeys')
          : (value?.replace(
              'CommandOrControl',
              navigator.userAgent.includes('Macintosh') ? '⌘' : 'Ctrl',
            ) ?? t('shortcut.notSet'))}
      </button>
      {problem && (
        <p role="alert" className="max-w-72 text-end text-xs text-danger">
          {problem}
        </p>
      )}
    </div>
  );
}
