import { IconButton, cn } from '@melodesk/ui';
import { ChevronLeft, ChevronRight, ListMusic } from 'lucide-react';
import { Outlet, useNavigate } from 'react-router';
import { usePlayerStore } from '../player/store';
import { HealthBanner } from './HealthBanner';
import { PlayerBar } from './PlayerBar';
import { QueuePanel } from './QueuePanel';
import { SearchBox } from './SearchBox';
import { Sidebar } from './Sidebar';
import { Toaster } from './components/Toaster';
import { useUiStore } from './uiStore';

export function Layout() {
  const navigate = useNavigate();
  const panel = useUiStore((s) => s.rightPanel);
  const togglePanel = useUiStore((s) => s.toggleRightPanel);
  const ready = usePlayerStore((s) => s.ready);
  return (
    <div
      className={cn(
        'grid h-full grid-rows-[1fr_auto]',
        panel ? 'grid-cols-[220px_1fr_320px]' : 'grid-cols-[220px_1fr]',
      )}
    >
      <Sidebar />
      <div className="flex min-w-0 flex-col">
        <div data-tauri-drag-region className="flex h-14 shrink-0 items-center gap-2 px-3 pt-2">
          <IconButton label="Back" size="sm" onClick={() => navigate(-1)}>
            <ChevronLeft />
          </IconButton>
          <IconButton label="Forward" size="sm" onClick={() => navigate(1)}>
            <ChevronRight />
          </IconButton>
          <div className="flex flex-1 justify-center">
            <SearchBox />
          </div>
          <IconButton
            label="Queue"
            size="sm"
            aria-pressed={panel === 'queue'}
            onClick={() => togglePanel('queue')}
            className={cn(panel === 'queue' && 'text-accent')}
          >
            <ListMusic />
          </IconButton>
        </div>
        <HealthBanner />
        <main className={cn('min-h-0 flex-1 overflow-y-auto', !ready && 'opacity-80')}>
          <Outlet />
        </main>
      </div>
      {panel && (
        <aside aria-label="Queue" className="min-h-0 border-l border-border bg-bg-elevated">
          <div data-tauri-drag-region className="h-10" />
          {panel === 'queue' && <QueuePanel />}
        </aside>
      )}
      <div className={cn(panel ? 'col-span-3' : 'col-span-2')}>
        <PlayerBar />
      </div>
      <Toaster />
    </div>
  );
}
