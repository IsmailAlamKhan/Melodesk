import { Plug } from 'lucide-react';
import { defineFeature, lyricsSources, type LyricsSource } from '../../core';
import {
  enablePlugin,
  isLyricsProviderOn,
  lyricsSignature,
  lyricsFromPlugins,
  startPluginHost,
  usePluginHost,
} from './host';
import { PluginsSection } from './PluginsSection';

/**
 * Offers the lyrics plugins to the lyrics view. They are opt-in, so the view can ask to turn one on
 * (LRCLIB, which has the most timed lyrics) and treats any of them being on as "on".
 */
const lrclib: LyricsSource = {
  id: 'lrclib',
  label: 'LRCLIB',
  isActive: isLyricsProviderOn,
  signature: lyricsSignature,
  subscribe: (onChange) => usePluginHost.subscribe(onChange),
  activate: () => void enablePlugin('lrclib'),
  fetch: lyricsFromPlugins,
};

export default defineFeature({
  id: 'integrations',
  name: 'feature.integrations.name',
  description: 'feature.integrations.description',
  icon: Plug,
  contributes: {
    settings: [{ id: 'plugins', category: 'plugins', order: 60, component: PluginsSection }],
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
