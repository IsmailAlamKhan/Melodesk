import { cn } from '@melodesk/ui';

export function Toggle({
  label,
  hint,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      className={cn(
        'flex items-center justify-between gap-4 rounded-2xl border border-border/50 bg-bg-elevated px-4 py-3',
        disabled && 'opacity-60',
      )}
    >
      <span>
        <span className="block text-sm font-medium">{label}</span>
        {hint && <span className="block text-xs text-fg-muted">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-accent"
      />
    </label>
  );
}
