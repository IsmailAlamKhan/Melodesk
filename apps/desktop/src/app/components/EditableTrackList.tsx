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
import type { Item } from '@melodesk/adapter';
import { IconButton, cn } from '@melodesk/ui';
import { GripVertical, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useT } from '../../i18n';
import { playEndpoint } from '../../player/actions';
import { movePlaylistItem, removeFromPlaylist } from '../dialogs/playlists';
import { ItemRow } from './ItemRow';

type Track = Extract<Item, { kind: 'song' | 'video' }>;

/** The user's own playlist: drag to reorder and remove, written straight to the account. */
export function EditableTrackList({ playlistId, tracks }: { playlistId: string; tracks: Item[] }) {
  const songs = useMemo(
    () =>
      tracks.filter((t): t is Track => (t.kind === 'song' || t.kind === 'video') && !!t.setVideoId),
    [tracks],
  );
  // Local order shows the drop immediately; it is discarded as soon as the account reports a new order.
  const [override, setOverride] = useState<{ base: Track[]; order: Track[] } | null>(null);
  const order = override?.base === songs ? override.order : songs;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const onDragEnd = (e: DragEndEvent): void => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = order.findIndex((t) => t.setVideoId === active.id);
    const to = order.findIndex((t) => t.setVideoId === over.id);
    const moved = order[from];
    if (!moved?.setVideoId) return;
    const next = arrayMove(order, from, to);
    setOverride({ base: songs, order: next });
    const before = next[to + 1]?.setVideoId ?? null;
    void movePlaylistItem(playlistId, moved.setVideoId, before);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[restrictToVerticalAxis]}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={order.map((t) => t.setVideoId ?? '')}
        strategy={verticalListSortingStrategy}
      >
        <div role="table" className="flex flex-col px-4">
          {order.map((t, i) => (
            <SortableRow key={t.setVideoId ?? t.key} track={t} index={i} playlistId={playlistId} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableRow({
  track,
  index,
  playlistId,
}: {
  track: Track;
  index: number;
  playlistId: string;
}) {
  const t = useT();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: track.setVideoId ?? '',
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group/row flex items-center',
        isDragging && 'z-10 rounded-md bg-bg-overlay shadow',
      )}
    >
      <button
        type="button"
        aria-label={t('queue.dragToReorder')}
        className="w-6 cursor-grab text-fg-subtle opacity-0 group-hover/row:opacity-100 active:cursor-grabbing"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
        <ItemRow
          item={track}
          index={index}
          showIndex
          onPlay={() =>
            void playEndpoint({
              type: 'watch',
              videoId: track.videoId,
              playlistId,
              index,
              ...(track.setVideoId ? { playlistSetVideoId: track.setVideoId } : {}),
            })
          }
        />
      </div>
      <IconButton
        label={t('playlist.removeTrack')}
        size="sm"
        className="opacity-0 group-hover/row:opacity-100"
        onClick={() => {
          if (track.setVideoId)
            void removeFromPlaylist(playlistId, [
              { videoId: track.videoId, setVideoId: track.setVideoId },
            ]);
        }}
      >
        <X />
      </IconButton>
    </div>
  );
}
