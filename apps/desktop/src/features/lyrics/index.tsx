import { MicVocal } from 'lucide-react';
import { useUiStore } from '../../app/uiStore';
import { defineFeature } from '../../core';
import { t } from '../../i18n';
import { LyricsPanel } from './LyricsPanel';
import { useLyricsPrefs } from './prefs';

const toggle = (): void => useUiStore.getState().toggleRightPanel('lyrics');

/** The lyrics column beside the artwork in full-screen Now Playing. */
function NowPlayingLyrics() {
  return (
    <div className="hidden h-[70vh] min-h-0 lg:block">
      <LyricsPanel large />
    </div>
  );
}

export default defineFeature({
  id: 'lyrics',
  name: 'feature.lyrics.name',
  description: 'feature.lyrics.description',
  icon: MicVocal,
  contributes: {
    panels: [
      { id: 'lyrics', label: 'nav.lyrics', icon: MicVocal, order: 10, component: LyricsPanel },
    ],
    slots: { 'nowPlaying.side': [{ id: 'lyrics', order: 10, component: NowPlayingLyrics }] },
    commands: () => [
      {
        id: 'lyrics',
        label: t('palette.cmd.lyrics'),
        icon: <MicVocal className="size-4" />,
        run: toggle,
      },
    ],
    menus: [
      {
        menu: 'view',
        order: 20,
        entries: () => [{ key: 'lyrics', label: t('nav.lyrics'), icon: <MicVocal />, run: toggle }],
      },
    ],
  },
  // Lyrics settings (romanize/translate choices) load when the feature turns on.
  start: () => {
    void useLyricsPrefs.getState().load();
  },
});
