import type { PageHeader } from '@melodesk/adapter';
import { Button, IconButton, cn } from '@melodesk/ui';
import { Heart, MoreHorizontal, Pencil, Play, Radio, Shuffle, Trash2 } from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { useT } from '../../i18n';
import { playEndpoint, runAction, runMenuItem } from '../../player/actions';
import { Artwork } from './Artwork';
import { openDialog } from '../dialogs/store';
import { deletePlaylist } from '../dialogs/playlists';

/** Hero header for artist / album / playlist pages. */
export function PageHeaderView({ header, round }: { header: PageHeader; round?: boolean }) {
  const t = useT();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const description = header.description ?? '';
  return (
    <header className="flex flex-col gap-6 p-6 md:flex-row md:items-end">
      {header.thumbnails.length > 0 && (
        <Artwork thumbnails={header.thumbnails} size={224} round={round} className="shadow-2xl" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        {header.subtitle && !round && (
          <div className="text-sm text-fg-muted">{header.subtitle}</div>
        )}
        <h1 className="font-display text-4xl leading-tight font-bold tracking-tight md:text-5xl">
          {header.title}
        </h1>
        {round && header.subtitle && <div className="text-sm text-fg-muted">{header.subtitle}</div>}
        {header.secondSubtitle && (
          <div className="text-sm text-fg-muted">{header.secondSubtitle}</div>
        )}
        {description && (
          <p
            className={cn(
              'max-w-2xl text-sm whitespace-pre-line text-fg-muted',
              !expanded && 'line-clamp-2',
            )}
            onClick={() => setExpanded((v) => !v)}
          >
            {description}
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {header.playEndpoint && (
            <Button variant="primary" onClick={() => void playEndpoint(header.playEndpoint)}>
              {header.playEndpoint === header.shuffleEndpoint ? (
                <Shuffle className="size-4" />
              ) : (
                <Play className="size-4" />
              )}
              {header.playEndpoint === header.shuffleEndpoint
                ? t('media.shuffle')
                : t('media.play')}
            </Button>
          )}
          {header.shuffleEndpoint && header.shuffleEndpoint !== header.playEndpoint && (
            <Button onClick={() => void playEndpoint(header.shuffleEndpoint)}>
              <Shuffle className="size-4" />
              {t('media.shuffle')}
            </Button>
          )}
          {header.radioEndpoint && (
            <Button onClick={() => void playEndpoint(header.radioEndpoint)}>
              <Radio className="size-4" />
              {t('media.radio')}
            </Button>
          )}
          {header.actions.map((a) => {
            const active = a.isToggled ? a.toggledAction : a.action;
            // Icon-only buttons we don't understand (e.g. YouTube's own edit button) are skipped.
            if (!active || (!a.text && a.icon !== 'LIKE' && a.icon !== 'SUBSCRIBE')) return null;
            const label =
              a.icon === 'LIKE'
                ? a.isToggled
                  ? t('header.liked')
                  : t('header.like')
                : a.icon === 'SUBSCRIBE'
                  ? a.isToggled
                    ? t('header.subscribed')
                    : t('header.subscribe')
                  : a.text || (a.isToggled ? t('header.saved') : t('header.save'));
            return (
              <Button
                key={`${String(a.icon)}-${a.text}`}
                variant={a.isToggled ? 'secondary' : 'ghost'}
                aria-pressed={a.isToggled}
                onClick={() =>
                  void runAction(active, { label: a.isToggled ? t('header.removed') : label })
                }
              >
                {a.icon === 'LIKE' && (
                  <Heart className={cn('size-4', a.isToggled && 'fill-current')} />
                )}
                {label}
              </Button>
            );
          })}
          {header.isEditable && header.playlistId && (
            <>
              <Button
                variant="ghost"
                onClick={() =>
                  openDialog({
                    type: 'editPlaylist',
                    playlistId: header.playlistId ?? '',
                    title: header.title,
                    description: header.description ?? '',
                    privacy: header.privacy ?? 'PRIVATE',
                  })
                }
              >
                <Pencil className="size-4" />
                {t('common.edit')}
              </Button>
              <Button
                variant="ghost"
                onClick={() =>
                  openDialog({
                    type: 'confirm',
                    title: t('playlist.deleteTitle'),
                    body: t('playlist.deleteBody', { title: header.title }),
                    confirmLabel: t('common.delete'),
                    danger: true,
                    onConfirm: async () => {
                      await deletePlaylist(header.playlistId ?? '');
                      void navigate('/library/playlists');
                    },
                  })
                }
              >
                <Trash2 className="size-4" />
                {t('common.delete')}
              </Button>
            </>
          )}
          {header.menu.length > 0 && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <IconButton label={t('common.more')}>
                  <MoreHorizontal />
                </IconButton>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="start"
                  className="z-50 min-w-56 rounded-lg border border-border bg-bg-elevated p-1 text-sm shadow-xl"
                >
                  {header.menu.map((m) => (
                    <DropdownMenu.Item
                      key={`${m.text}-${String(m.icon)}`}
                      className="flex cursor-default items-center gap-3 rounded-md px-3 py-2 outline-none data-[highlighted]:bg-bg-overlay"
                      onSelect={() => void runMenuItem(m, undefined, (to) => void navigate(to))}
                    >
                      {m.toggled?.isToggled ? m.toggled.text : m.text}
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
        </div>
      </div>
    </header>
  );
}
