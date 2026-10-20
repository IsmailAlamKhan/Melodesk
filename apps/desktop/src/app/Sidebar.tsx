import { BROWSE_IDS } from '@melodesk/adapter';
import { cn } from '@melodesk/ui';
import { BarChart3, Compass, Home, Library, ListMusic, Plus, Settings } from 'lucide-react';
import { NavLink } from 'react-router';
import { useBrowse } from '../data/hooks';
import { routeForEndpoint } from '../player/actions';
import { usePlayerStore } from '../player/store';
import { Artwork } from './components/Artwork';
import { openDialog } from './dialogs/store';

const nav = [
  { to: '/', label: 'Home', icon: Home, end: true },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/library', label: 'Library', icon: Library },
  { to: '/stats', label: 'Stats', icon: BarChart3 },
];

export function Sidebar() {
  const loggedIn = usePlayerStore((s) => s.loggedIn);
  const playlists = useBrowse(BROWSE_IDS.libraryPlaylists, undefined);
  const items = loggedIn
    ? (playlists.data?.shelves.flatMap((s) => s.items).filter((i) => i.kind === 'playlist') ?? [])
    : [];
  return (
    <nav
      aria-label="Primary"
      className="flex h-full min-h-0 flex-col border-e border-border bg-bg-elevated"
    >
      <div data-tauri-drag-region className="h-10 shrink-0" />
      <div className="flex flex-col gap-1 px-3">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end ?? false}
            className={({ isActive }) =>
              cn(
                'flex h-(--nav-h) items-center gap-3 rounded-md px-2 text-sm transition-colors duration-(--duration-fast)',
                isActive
                  ? 'bg-bg-overlay text-fg'
                  : 'text-fg-muted hover:bg-bg-overlay hover:text-fg',
              )
            }
          >
            <n.icon className="size-5" />
            {n.label}
          </NavLink>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between px-5 text-xs font-medium tracking-wide text-fg-subtle uppercase">
        <span>Playlists</span>
        {loggedIn && (
          <button
            type="button"
            aria-label="New playlist"
            className="text-fg-subtle hover:text-fg"
            onClick={() => openDialog({ type: 'createPlaylist' })}
          >
            <Plus className="size-4" />
          </button>
        )}
      </div>
      <div className="mt-1 flex-1 overflow-y-auto px-3 pb-2">
        {items.map((p) => (
          <NavLink
            key={p.key}
            to={routeForEndpoint(p.endpoint) ?? '#'}
            className={({ isActive }) =>
              cn(
                'flex h-[calc(var(--nav-h)+0.25rem)] items-center gap-2 rounded-md px-2 text-sm',
                isActive
                  ? 'bg-bg-overlay text-fg'
                  : 'text-fg-muted hover:bg-bg-overlay hover:text-fg',
              )
            }
          >
            <Artwork thumbnails={p.thumbnails} size={28} />
            <span className="truncate">{p.title}</span>
          </NavLink>
        ))}
        {loggedIn && !items.length && !playlists.isPending && (
          <div className="px-2 text-xs text-fg-subtle">No playlists yet</div>
        )}
        {!loggedIn && (
          <div className="px-2 text-xs text-fg-subtle">
            <ListMusic className="mb-1 size-4" />
            Sign in to see your playlists
          </div>
        )}
      </div>
      <div className="border-t border-border p-3">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cn(
              'flex h-(--nav-h) items-center gap-3 rounded-md px-2 text-sm',
              isActive
                ? 'bg-bg-overlay text-fg'
                : 'text-fg-muted hover:bg-bg-overlay hover:text-fg',
            )
          }
        >
          <Settings className="size-5" />
          Settings
        </NavLink>
      </div>
    </nav>
  );
}
