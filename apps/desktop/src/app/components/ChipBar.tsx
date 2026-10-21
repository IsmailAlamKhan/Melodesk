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
              'h-9 shrink-0 rounded-full px-4 text-sm font-medium transition-colors duration-(--duration-fast)',
              active ? 'bg-accent text-accent-fg' : 'bg-bg-overlay text-fg hover:bg-accent-soft',
            )}
          >
            {c.text}
          </button>
        );
      })}
    </div>
  );
}
