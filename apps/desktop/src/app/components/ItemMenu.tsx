import * as ContextMenu from '@radix-ui/react-context-menu';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { Item, MenuItem } from '@melodesk/adapter';
import { IconButton } from '@melodesk/ui';
import { ListEnd, ListPlus, MoreHorizontal, Share2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { queueAdd, runAction, runMenuItem, shareUrl } from '../../player/actions';
import { toast } from '../toast';
import { openDialog } from '../dialogs/store';

const menuClass =
  'z-50 min-w-56 rounded-lg border border-border bg-bg-elevated p-1 text-sm shadow-xl';
const itemClass =
  'flex cursor-default select-none items-center gap-3 rounded-md px-3 py-2 outline-none data-[highlighted]:bg-bg-overlay';

interface Entry {
  key: string;
  label: string;
  icon?: ReactNode;
  run: () => void | Promise<void>;
}

/** YouTube's own menu entries for the item, plus our extras (queue shortcuts, copy link). */
export function useItemEntries(item: Item): Entry[] {
  const navigate = useNavigate();
  const entries: Entry[] = [];
  const hasQueue = item.menu.some((m) => m.action?.type === 'queueAdd');
  const target =
    item.kind === 'song' || item.kind === 'video' || item.kind === 'episode'
      ? { videoId: item.videoId }
      : item.kind === 'playlist'
        ? { playlistId: item.playlistId }
        : item.kind === 'album' && item.playlistId
          ? { playlistId: item.playlistId }
          : null;
  if (!hasQueue && target) {
    entries.push({
      key: 'next',
      label: 'Play next',
      icon: <ListPlus className="size-4" />,
      run: () => queueAdd(target, 'next'),
    });
    entries.push({
      key: 'end',
      label: 'Add to queue',
      icon: <ListEnd className="size-4" />,
      run: () => queueAdd(target, 'end'),
    });
  }
  const videoId =
    item.kind === 'song' || item.kind === 'video' || item.kind === 'episode' ? item.videoId : null;
  for (const m of item.menu) {
    if (m.action?.type === 'signInRequired' && !m.toggled) continue;
    const label = m.toggled?.isToggled ? m.toggled.text : m.text;
    if ((m.action?.type === 'addToPlaylist' || m.icon === 'ADD_TO_PLAYLIST') && videoId) {
      entries.push({
        key: 'addToPlaylist',
        label,
        run: () => openDialog({ type: 'addToPlaylist', videoIds: [videoId], label: item.title }),
      });
      continue;
    }
    entries.push({
      key: `${m.text}:${String(m.icon)}`,
      label,
      run: () => runMenuItem(m, item, (to) => void navigate(to)),
    });
  }
  // Our own "Save to playlist" when YouTube's menu only offered it behind sign-in.
  if (videoId && !entries.some((e) => e.key === 'addToPlaylist')) {
    entries.push({
      key: 'addToPlaylist',
      label: 'Save to playlist',
      run: () => openDialog({ type: 'addToPlaylist', videoIds: [videoId], label: item.title }),
    });
  }
  const url = shareUrl(item);
  if (url && !item.menu.some((m) => m.action?.type === 'share')) {
    entries.push({
      key: 'copy',
      label: 'Copy link',
      icon: <Share2 className="size-4" />,
      run: async () => {
        await navigator.clipboard.writeText(url);
        toast('Link copied');
      },
    });
  }
  return entries;
}

export function ItemContextMenu({ item, children }: { item: Item; children: ReactNode }) {
  const entries = useItemEntries(item);
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={menuClass}>
          {entries.map((e) => (
            <ContextMenu.Item key={e.key} className={itemClass} onSelect={() => void e.run()}>
              {e.icon ?? <span className="size-4" />}
              {e.label}
            </ContextMenu.Item>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export function ItemMenuButton({ item, className }: { item: Item; className?: string }) {
  const entries = useItemEntries(item);
  if (!entries.length) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton
          label="More"
          size="sm"
          className={className}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" className={menuClass}>
          {entries.map((e) => (
            <DropdownMenu.Item key={e.key} className={itemClass} onSelect={() => void e.run()}>
              {e.icon ?? <span className="size-4" />}
              {e.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export { runAction };
export type { MenuItem };
