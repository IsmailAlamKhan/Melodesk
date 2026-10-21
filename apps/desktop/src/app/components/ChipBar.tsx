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
              'type-label-large state-layer m3-motion flex h-8 shrink-0 items-center rounded-sm border px-4',
              active
                ? 'border-transparent bg-secondary-container text-on-secondary-container'
                : 'border-outline-variant text-on-surface-variant',
            )}
          >
            {c.text}
          </button>
        );
      })}
    </div>
  );
}
