import { IconButton, cn } from '@melodesk/ui';
import { ChevronLeft, ChevronRight, ListMusic, MicVocal } from 'lucide-react';
import { Outlet, useNavigate } from 'react-router';
import { useT } from '../i18n';
import { usePlayerStore } from '../player/store';
import { HealthBanner } from './HealthBanner';
import { PlayerBar } from './PlayerBar';
import { LyricsPanel } from './LyricsPanel';
import { NowPlayingView } from './NowPlayingView';
import { CommandPalette } from './CommandPalette';
import { QueuePanel } from './QueuePanel';
import { DialogHost } from './dialogs/DialogHost';
import { SearchBox } from './SearchBox';
import { useAudioSync } from '../audio/useAudioSync';
import { Sidebar } from './Sidebar';
import { Toaster } from './components/Toaster';
import { useUiStore } from './uiStore';

export function Layout() {
  const t = useT();
  const navigate = useNavigate();
  const panel = useUiStore((s) => s.rightPanel);
  const togglePanel = useUiStore((s) => s.toggleRightPanel);
  const ready = usePlayerStore((s) => s.ready);
  useAudioSync();
  return (
    <div
      className={cn(
        'grid h-full grid-rows-[minmax(0,1fr)_auto]',
        panel ? 'grid-cols-[220px_1fr_320px]' : 'grid-cols-[220px_1fr]',
      )}
    >
      <Sidebar />
      <div data-content className="flex min-h-0 min-w-0 flex-col">
        <div data-tauri-drag-region className="flex h-14 shrink-0 items-center gap-2 px-3 pt-2">
          <IconButton label={t('nav.back')} size="sm" onClick={() => navigate(-1)}>
            <ChevronLeft className="rtl:-scale-x-100" />
          </IconButton>
          <IconButton label={t('nav.forward')} size="sm" onClick={() => navigate(1)}>
            <ChevronRight className="rtl:-scale-x-100" />
          </IconButton>
          <div className="flex flex-1 justify-center">
            <SearchBox />
          </div>
          <IconButton
            label={t('nav.lyrics')}
            size="sm"
            aria-pressed={panel === 'lyrics'}
            onClick={() => togglePanel('lyrics')}
            className={cn(panel === 'lyrics' && 'text-accent')}
          >
            <MicVocal />
          </IconButton>
          <IconButton
            label={t('nav.queue')}
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
        <aside
          aria-label={panel === 'queue' ? t('nav.queue') : t('nav.lyrics')}
          className="flex min-h-0 flex-col border-s border-border bg-bg-elevated"
        >
          <div data-tauri-drag-region className="h-10 shrink-0" />
          <div className="min-h-0 flex-1">
            {panel === 'queue' ? <QueuePanel /> : <LyricsPanel />}
          </div>
        </aside>
      )}
      <div className={cn(panel ? 'col-span-3' : 'col-span-2')}>
        <PlayerBar />
      </div>
      <NowPlayingView />
      <CommandPalette />
      <Toaster />
      <DialogHost />
    </div>
  );
}
