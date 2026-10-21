import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { QueueItem } from '@melodesk/bridge/protocol';
import { IconButton, Tooltip, cn } from '@melodesk/ui';
import { GripVertical, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useT } from '../i18n';
import { sendCommand } from '../player/ipc';
import { usePlayerStore } from '../player/store';
import { QueueToolsMenu } from './tools/QueueToolsMenu';
import { CachedImg } from '../artwork/CachedImg';

/** The page's live queue, mirrored from YouTube's own store; drag to reorder, click to jump. */
export function QueuePanel() {
  const t = useT();
  const queue = usePlayerStore((s) => s.queue);
  // Items mirror the page's queue; a local override shows the reorder immediately until the page confirms.
  const fromPage = useMemo(
    () => (queue?.items ?? []).map((it, i) => ({ ...it, id: `${it.videoId}-${String(i)}` })),
    [queue],
  );
  const [override, setOverride] = useState<{
    base: typeof fromPage;
    items: typeof fromPage;
  } | null>(null);
  const items = override?.base === fromPage ? override.items : fromPage;
  const setItems = (fn: (prev: typeof fromPage) => typeof fromPage): void => {
    setOverride({ base: fromPage, items: fn(items) });
  };
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (!queue) return <div className="p-4 text-sm text-fg-muted">{t('queue.empty')}</div>;
  const onDragEnd = (e: DragEndEvent): void => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = items.findIndex((i) => i.id === active.id);
    const to = items.findIndex((i) => i.id === over.id);
    setItems((prev) => arrayMove(prev, from, to));
    void sendCommand({ type: 'queueMove', from, to });
  };
  const userItems = items.filter((i) => !i.isAutomix);
  const automix = items.filter((i) => i.isAutomix);
  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center justify-between px-4 py-3">
        <div>
          <div className="text-xs text-fg-subtle">{t('queue.playingFrom')}</div>
          <div className="truncate text-sm font-medium">{queue.title ?? 'Queue'}</div>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            {t('queue.autoplay')}
            <input
              type="checkbox"
              checked={queue.autoplay}
              onChange={(e) => void sendCommand({ type: 'setAutoplay', enabled: e.target.checked })}
            />
          </label>
          <QueueToolsMenu />
        </div>
      </header>
      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          modifiers={[restrictToVerticalAxis]}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={userItems.map((i) => i.id)}
            strategy={verticalListSortingStrategy}
          >
            {userItems.map((it, i) => (
              <QueueRow key={it.id} item={it} index={i} current={i === queue.index} />
            ))}
          </SortableContext>
        </DndContext>
        {automix.length > 0 && (
          <>
            <div className="px-2 pt-4 pb-1 text-xs font-medium tracking-wide text-fg-subtle uppercase">
              {t('queue.autoplay')}
            </div>
            {automix.map((it, i) => (
              <QueueRow key={it.id} item={it} index={userItems.length + i} current={false} />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function QueueRow({
  item,
  index,
  current,
}: {
  item: QueueItem & { id: string };
  index: number;
  current: boolean;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: item.isAutomix,
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group flex h-(--row-h) items-center gap-2 rounded-md px-1 hover:bg-state-hover',
        current && 'bg-secondary-container text-on-secondary-container',
        isDragging && 'z-10 bg-bg-overlay shadow',
      )}
      onDoubleClick={() => void sendCommand({ type: 'queueSelect', index })}
    >
      {!item.isAutomix ? (
        <Tooltip label={t('queue.dragToReorder')}>
          <button
            type="button"
            aria-label={t('queue.dragToReorder')}
            className="cursor-grab text-fg-subtle opacity-0 group-hover:opacity-100 active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
        </Tooltip>
      ) : (
        <span className="w-4" />
      )}
      {item.artworkUrl ? (
        <CachedImg src={item.artworkUrl} alt="" className="size-10 rounded-sm object-cover" />
      ) : (
        <div className="size-10 rounded-sm bg-bg-overlay" />
      )}
      <button
        type="button"
        className="min-w-0 flex-1 text-start"
        onClick={() => void sendCommand({ type: 'queueSelect', index })}
      >
        <div className="truncate text-sm font-medium">{item.title}</div>
        <div className="truncate text-xs text-fg-muted">{item.artist}</div>
      </button>
      {!item.isAutomix && (
        <IconButton
          label={t('queue.remove')}
          size="sm"
          className="opacity-0 group-hover:opacity-100"
          onClick={() => void sendCommand({ type: 'queueRemove', index })}
        >
          <X />
        </IconButton>
      )}
    </div>
  );
}
