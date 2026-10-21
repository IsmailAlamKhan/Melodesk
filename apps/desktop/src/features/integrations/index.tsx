import { Plug } from 'lucide-react';
import { defineFeature, lyricsSources, type LyricsSource } from '../../core';
import {
  enablePlugin,
  isPluginEnabled,
  lyricsFromPlugins,
  startPluginHost,
  usePluginHost,
} from './host';
import { PluginsSection } from './PluginsSection';

/** Offers LRCLIB to the lyrics view: the plugin is opt-in, so the view can ask to turn it on. */
const lrclib: LyricsSource = {
  id: 'lrclib',
  label: 'LRCLIB',
  useActive: () =>
    usePluginHost((s) => s.plugins.some((p) => p.manifest.id === 'lrclib' && p.enabled)),
  isActive: () => isPluginEnabled('lrclib'),
  activate: () => void enablePlugin('lrclib'),
  fetch: lyricsFromPlugins,
};

export default defineFeature({
  id: 'integrations',
  name: 'feature.integrations.name',
  description: 'feature.integrations.description',
  icon: Plug,
  contributes: {
    settings: [{ id: 'plugins', order: 60, component: PluginsSection }],
  },
  start: () => {
    const stopHost = startPluginHost();
    const offLyrics = lyricsSources.register(lrclib);
    return () => {
      offLyrics();
      stopHost();
    };
  },
});
