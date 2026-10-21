import type { Chip } from '@melodesk/adapter';
import { cn } from '@melodesk/ui';

export function ChipBar({
  chips,
  selected,
  onSelect,
}: {
  chips: Chip[];
  selected?: string | null;
  onSelect: (chip: Chip | null) => void;
}) {
  if (!chips.length) return null;
  return (
    <div role="tablist" className="flex gap-2 overflow-x-auto px-2 pb-1 [scrollbar-width:none]">
      {chips.map((c) => {
        const active = selected !== undefined ? selected === c.text : c.isSelected;
        return (
          <button
            key={c.text}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(active ? null : c)}
            className={cn(
              'h-8 shrink-0 rounded-full border px-3 text-sm transition-colors duration-(--duration-fast)',
              active
                ? 'border-accent bg-accent text-accent-fg'
                : 'border-border bg-bg-overlay text-fg-muted hover:border-accent hover:bg-accent-soft hover:text-fg',
            )}
          >
            {c.text}
          </button>
        );
      })}
    </div>
  );
}
