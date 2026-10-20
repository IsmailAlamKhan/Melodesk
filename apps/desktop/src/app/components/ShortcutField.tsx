import { cn } from '@melodesk/ui';
import { useState } from 'react';
import { acceleratorFromEvent } from '../../settings/store';

/** Click, then press a combination; Backspace clears. */
export function ShortcutField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const [recording, setRecording] = useState(false);
  return (
    <button
      type="button"
      aria-label={value ? `Shortcut ${value}; press to change` : 'Set shortcut'}
      onClick={() => setRecording(true)}
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
          onChange(combo);
          setRecording(false);
        }
      }}
      className={cn(
        'h-8 min-w-40 rounded-md border px-3 text-left font-mono text-xs',
        recording
          ? 'border-accent text-fg'
          : 'border-border bg-bg-elevated text-fg-muted hover:text-fg',
      )}
    >
      {recording
        ? 'Press keys…'
        : (value?.replace(
            'CommandOrControl',
            navigator.userAgent.includes('Macintosh') ? '⌘' : 'Ctrl',
          ) ?? 'Not set')}
    </button>
  );
}
