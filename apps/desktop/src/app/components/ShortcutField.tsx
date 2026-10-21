import { cn } from '@melodesk/ui';
import { useState } from 'react';
import { useT } from '../../i18n';
import { acceleratorFromEvent, shortcutProblem } from '../../settings/store';

/** Click, then press a combination; Backspace clears. */
export function ShortcutField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const t = useT();
  const [recording, setRecording] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        aria-label={value ? t('shortcut.changeAria', { combo: value }) : t('shortcut.set')}
        onClick={() => {
          setProblem(null);
          setRecording(true);
        }}
        onBlur={() => setRecording(false)}
        onKeyDown={(e) => {
          if (!recording) return;
          e.preventDefault();
          if (e.key === 'Escape') {
            setRecording(false);
            return;
          }
          if (e.key === 'Backspace' || e.key === 'Delete') {
            onChange(null);
            setRecording(false);
            return;
          }
          const combo = acceleratorFromEvent(e.nativeEvent);
          if (combo) {
            const bad = shortcutProblem(combo);
            if (bad) {
              // Keep the old value; say why this one can't be a global shortcut.
              setProblem(t(`shortcut.err.${bad}` as const));
              setRecording(false);
              return;
            }
            setProblem(null);
            onChange(combo);
            setRecording(false);
          }
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
