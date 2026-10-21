import * as ContextMenu from '@radix-ui/react-context-menu';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import type { Item, MenuItem } from '@melodesk/adapter';
import { IconButton } from '@melodesk/ui';
import { ListEnd, ListPlus, MoreHorizontal, Share2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { queueAdd, runAction, runMenuItem, shareUrl } from '../../player/actions';
import { useT } from '../../i18n';
import { toast } from '../toast';
import { openDialog } from '../dialogs/store';
import {
  ContextEntries,
  DropdownEntries,
  entryIcon,
  isDangerIcon,
  menuContent,
  type ActionEntry,
} from './menu';

type Entry = ActionEntry;

/** YouTube's own menu entries for the item, plus our extras (queue shortcuts, copy link). */
export function useItemEntries(item: Item): Entry[] {
  const t = useT();
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
      label: t('menu.playNext'),
      icon: <ListPlus className="size-4" />,
      run: () => queueAdd(target, 'next'),
    });
    entries.push({
      key: 'end',
      label: t('menu.addToQueue'),
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
        icon: entryIcon('ADD_TO_PLAYLIST'),
        run: () => openDialog({ type: 'addToPlaylist', videoIds: [videoId], label: item.title }),
      });
      continue;
    }
    entries.push({
      key: `${m.text}:${String(m.icon)}`,
      label,
      icon: entryIcon(m.icon),
      danger: isDangerIcon(m.icon),
      run: () => runMenuItem(m, item, (to) => void navigate(to)),
    });
  }
  // Our own "Save to playlist" when YouTube's menu only offered it behind sign-in.
  if (videoId && !entries.some((e) => e.key === 'addToPlaylist')) {
    entries.push({
      key: 'addToPlaylist',
      label: t('menu.saveToPlaylist'),
      icon: entryIcon('ADD_TO_PLAYLIST'),
      run: () => openDialog({ type: 'addToPlaylist', videoIds: [videoId], label: item.title }),
    });
  }
  const url = shareUrl(item);
  if (url && !item.menu.some((m) => m.action?.type === 'share')) {
    entries.push({
      key: 'copy',
      label: t('menu.copyLink'),
      icon: <Share2 className="size-4" />,
      run: async () => {
        await navigator.clipboard.writeText(url);
        toast(t('toast.linkCopied'));
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
        <ContextMenu.Content className={menuContent}>
          <ContextEntries entries={entries} />
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export function ItemMenuButton({ item, className }: { item: Item; className?: string }) {
  const t = useT();
  const entries = useItemEntries(item);
  if (!entries.length) return null;
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <IconButton
          label={t('common.more')}
          size="sm"
          className={className}
          onClick={(e) => e.stopPropagation()}
        >
          <MoreHorizontal />
        </IconButton>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" className={menuContent}>
          <DropdownEntries entries={entries} />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export { runAction };
export type { MenuItem };
