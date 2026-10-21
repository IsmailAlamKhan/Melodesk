import { BROWSE_IDS } from '@melodesk/adapter';
import { Tooltip, cn } from '@melodesk/ui';
import { ListMusic, Plus } from 'lucide-react';
import { NavLink } from 'react-router';
import { Artwork } from '../../app/components/Artwork';
import { openDialog } from '../../app/dialogs/store';
import { useBrowse } from '../../data/hooks';
import { useT } from '../../i18n';
import { routeForEndpoint } from '../../player/actions';
import { usePlayerStore } from '../../player/store';

/** The account's playlists in the sidebar, with a button to make a new one. */
export function SidebarPlaylists() {
  const t = useT();
  const loggedIn = usePlayerStore((s) => s.loggedIn);
  const playlists = useBrowse(BROWSE_IDS.libraryPlaylists, undefined);
  const items = loggedIn
    ? (playlists.data?.shelves.flatMap((s) => s.items).filter((i) => i.kind === 'playlist') ?? [])
    : [];
  return (
    <>
      <div className="mt-4 flex items-center justify-between px-5 text-xs font-medium tracking-wide text-fg-subtle uppercase">
        <span>{t('nav.playlists')}</span>
        {loggedIn && (
          <Tooltip label={t('nav.newPlaylist')}>
            <button
              type="button"
              aria-label={t('nav.newPlaylist')}
              className="text-fg-subtle hover:text-accent"
              onClick={() => openDialog({ type: 'createPlaylist' })}
            >
              <Plus className="size-4" />
            </button>
          </Tooltip>
        )}
      </div>
      <div className="mt-1 min-h-0 flex-1 overflow-y-auto px-3 pb-2">
        {items.map((p) => (
          <NavLink
            key={p.key}
            to={routeForEndpoint(p.endpoint) ?? '#'}
            className={({ isActive }) =>
              cn(
                'flex h-[calc(var(--nav-h)+0.25rem)] items-center gap-2 rounded-lg px-3 text-sm',
                isActive
                  ? 'bg-accent-soft font-medium text-accent'
                  : 'text-fg-muted hover:bg-bg-overlay hover:text-fg',
              )
            }
          >
            <Artwork thumbnails={p.thumbnails} size={28} />
            <span className="truncate">{p.title}</span>
          </NavLink>
        ))}
        {loggedIn && !items.length && !playlists.isPending && (
          <div className="px-2 text-xs text-fg-subtle">{t('nav.noPlaylists')}</div>
        )}
        {!loggedIn && (
          <div className="px-2 text-xs text-fg-subtle">
            <ListMusic className="mb-1 size-4" />
            {t('nav.signInForPlaylists')}
          </div>
        )}
      </div>
    </>
  );
}
