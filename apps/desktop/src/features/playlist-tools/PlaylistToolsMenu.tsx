import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Button } from '@melodesk/ui';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownAZ, Copy, Download, GitMerge, Wrench } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useT, type MessageKey } from '../../i18n/index';
import {
  menuContent as menuClass,
  menuItem as itemClass,
  menuSeparator,
} from '../../app/components/menu';
import { fetchAddToPlaylistOptions, removeFromPlaylist } from '../../app/dialogs/playlists';
import { openDialog } from '../../app/dialogs/store';
import { toast } from '../../app/toast';
import type { SlotMap } from '../../core';
import { sortTracks, type SortKey } from '../../app/components/trackSort';
import { applyOrder, exportPlaylist, findDuplicates, mergeInto } from './playlistTools';

export type PlaylistToolsProps = SlotMap['playlist.header'];

/** "Tools" menu on playlist/album pages: sort, duplicates, merge, export. */
export function PlaylistToolsMenu({
  title,
  playlistId,
  tracks,
  editable,
  viewSort,
  onViewSort,
}: PlaylistToolsProps) {
  const t = useT();
  const [busy, setBusy] = useState<string | null>(null);
  const options = useQuery({
    queryKey: ['addToPlaylist', 'merge'],
    queryFn: () => fetchAddToPlaylistOptions([tracks[0]?.videoId ?? '']),
    enabled: tracks.length > 0,
  });
  const dupes = findDuplicates(tracks);
  const extra = dupes.flatMap((g) => g.slice(1));
  const sortItem = (key: SortKey, labelKey: MessageKey): ReactNode => (
    <DropdownMenu.Item
      key={key}
      className={itemClass}
      onSelect={() =>
        onViewSort(
          viewSort?.key === key
            ? viewSort.dir === 'asc'
              ? { key, dir: 'desc' }
              : null
            : { key, dir: 'asc' },
        )
      }
    >
      <ArrowDownAZ className="size-4" />
      {t(labelKey)}
      {viewSort?.key === key && (
        <span className="ms-auto text-xs text-fg-subtle">{viewSort.dir === 'asc' ? '↑' : '↓'}</span>
      )}
    </DropdownMenu.Item>
  );
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" disabled={!tracks.length}>
          <Wrench className="size-4" />
          {t('tools.menu')}
          {busy && <span className="text-xs text-fg-subtle">{busy}</span>}
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="start" className={menuClass}>
          <DropdownMenu.Label className="px-3 py-1 text-xs text-fg-subtle">
            {t('tools.sortView')}
          </DropdownMenu.Label>
          {sortItem('title', 'tools.sort.title')}
          {sortItem('artist', 'tools.sort.artist')}
          {sortItem('album', 'tools.sort.album')}
          {sortItem('duration', 'tools.sort.duration')}
          {editable && playlistId && viewSort && (
            <DropdownMenu.Item
              className={itemClass}
              onSelect={() => {
                const desired = sortTracks(tracks, viewSort.key, viewSort.dir);
                setBusy(t('tools.reordering'));
                applyOrder(playlistId, tracks, desired, (done, total) =>
                  setBusy(`${String(done)}/${String(total)}`),
                )
                  .catch((e: unknown) => toast(String(e)))
                  .finally(() => {
                    setBusy(null);
                    onViewSort(null);
                  });
              }}
            >
              <ArrowDownAZ className="size-4" />
              {t('tools.applyOrder')}
            </DropdownMenu.Item>
          )}
          <DropdownMenu.Separator className={menuSeparator} />
          <DropdownMenu.Item
            className={itemClass}
            disabled={!extra.length}
            onSelect={() => {
              if (!editable || !playlistId) {
                toast(
                  t('tools.dupesToast', {
                    count: extra.length,
                    titles: `${extra
                      .map((tr) => tr.title)
                      .slice(0, 3)
                      .join(', ')}${extra.length > 3 ? '…' : ''}`,
                  }),
                );
                return;
              }
              openDialog({
                type: 'confirm',
                title: t('tools.removeDupesTitle'),
                body: t('tools.removeDupesBody', { count: extra.length }),
                confirmLabel: t('tools.remove'),
                danger: true,
                onConfirm: () =>
                  removeFromPlaylist(
                    playlistId,
                    extra
                      .filter((tr) => tr.setVideoId)
                      .map((tr) => ({ videoId: tr.videoId, setVideoId: tr.setVideoId ?? '' })),
                  ),
              });
            }}
          >
            <Copy className="size-4" />
            {extra.length
              ? t('tools.duplicates', { count: extra.length })
              : t('tools.noDuplicates')}
          </DropdownMenu.Item>
          <DropdownMenu.Sub>
            <DropdownMenu.SubTrigger className={itemClass}>
              <GitMerge className="size-4" />
              {t('tools.mergeInto')}
            </DropdownMenu.SubTrigger>
            <DropdownMenu.Portal>
              <DropdownMenu.SubContent className={menuClass}>
                {(options.data ?? [])
                  .filter((o) => o.playlistId !== playlistId && o.playlistId !== 'LM')
                  .map((o) => (
                    <DropdownMenu.Item
                      key={o.playlistId}
                      className={itemClass}
                      onSelect={() => {
                        setBusy(t('tools.merging'));
                        mergeInto(o.playlistId, o.title, tracks)
                          .catch((e: unknown) => toast(String(e)))
                          .finally(() => setBusy(null));
                      }}
                    >
                      {o.title}
                    </DropdownMenu.Item>
                  ))}
                {!options.data?.length && (
                  <div className="px-3 py-2 text-xs text-fg-subtle">
                    {options.isPending ? t('common.loading') : t('tools.noPlaylists')}
                  </div>
                )}
              </DropdownMenu.SubContent>
            </DropdownMenu.Portal>
          </DropdownMenu.Sub>
          <DropdownMenu.Separator className={menuSeparator} />
          <DropdownMenu.Item
            className={itemClass}
            onSelect={() =>
              void exportPlaylist(title, tracks, 'csv').catch((e: unknown) => toast(String(e)))
            }
          >
            <Download className="size-4" />
            {t('tools.exportCsv')}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={itemClass}
            onSelect={() =>
              void exportPlaylist(title, tracks, 'json').catch((e: unknown) => toast(String(e)))
            }
          >
            <Download className="size-4" />
            {t('tools.exportJson')}
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className={itemClass}
            onSelect={() =>
              void exportPlaylist(title, tracks, 'm3u8').catch((e: unknown) => toast(String(e)))
            }
          >
            <Download className="size-4" />
            {t('tools.exportM3u')}
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
