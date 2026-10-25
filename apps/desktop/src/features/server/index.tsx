import { Server } from 'lucide-react';
import { defineFeature, navigateTo } from '../../core';
import { t } from '../../i18n';
import { ConnectForm } from './ServerPage';
import { loadServer } from './config';
import { ServerAlbumPage, ServerArtistPage, ServerPage, ServerPlaylistPage } from './ServerPage';

function ServerSettings() {
  const tt = t;
  return (
    <section className="flex flex-col gap-3" aria-labelledby="server-title">
      <h2 id="server-title" className="font-semibold">
        {tt('server.title')}
      </h2>
      <p className="text-sm text-fg-muted">{tt('server.intro')}</p>
      <ConnectForm />
    </section>
  );
}

/**
 * Browse and play the music on a Subsonic-compatible server of your own (Navidrome, Airsonic, Gonic…).
 * Its songs are fetched when played and go through the local player, so the equalizer, crossfade and the
 * rest apply. It needs the Local music feature, which provides that player.
 */
export default defineFeature({
  id: 'server',
  name: 'feature.server.name',
  description: 'feature.server.description',
  icon: Server,
  dependsOn: ['local-music'],
  contributes: {
    routes: [
      { path: '/server', element: <ServerPage /> },
      { path: '/server/album', element: <ServerAlbumPage /> },
      { path: '/server/artist', element: <ServerArtistPage /> },
      { path: '/server/playlist', element: <ServerPlaylistPage /> },
    ],
    nav: [{ id: 'server', to: '/server', label: 'nav.server', icon: Server, order: 36 }],
    commands: () => [
      {
        id: 'server',
        label: t('palette.cmd.server'),
        icon: <Server className="size-4" />,
        keywords: 'navidrome subsonic airsonic',
        run: () => navigateTo('/server'),
      },
    ],
    settings: [{ id: 'server', category: 'general', order: 70, component: ServerSettings }],
  },
  start: () => {
    void loadServer();
  },
});
