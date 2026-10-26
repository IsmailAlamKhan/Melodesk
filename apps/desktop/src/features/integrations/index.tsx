import { Plug } from 'lucide-react';
import {
  aiSources,
  defineFeature,
  infoSources,
  lyricsSources,
  type AiSource,
  type InfoSource,
  type LyricsSource,
} from '../../core';
import {
  enablePlugin,
  canExplainLyrics,
  canSuggestRules,
  suggestRulesFromPlugins,
  explainLyric,
  isInfoProviderOn,
  isLyricsProviderOn,
  newReleasesFromPlugins,
  songInfoFromPlugins,
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
  ready: () => usePluginHost.getState().loaded,
  canExplain: canExplainLyrics,
  explain: explainLyric,
  subscribe: (onChange) => usePluginHost.subscribe(onChange),
  activate: () => void enablePlugin('lrclib'),
  fetch: lyricsFromPlugins,
};

/** Facts about songs and new releases come from MusicBrainz; the views ask before it is switched on. */
const musicbrainz: InfoSource = {
  id: 'musicbrainz',
  label: 'MusicBrainz',
  isActive: isInfoProviderOn,
  subscribe: (onChange) => usePluginHost.subscribe(onChange),
  activate: () => void enablePlugin('musicbrainz'),
  songInfo: songInfoFromPlugins,
  newReleases: newReleasesFromPlugins,
};

/** A model on this computer (Ollama) can fill in smart-playlist rules from a description. */
const localAi: AiSource = {
  id: 'ollama',
  label: 'Ollama',
  isActive: canSuggestRules,
  subscribe: (onChange) => usePluginHost.subscribe(onChange),
  suggestRules: suggestRulesFromPlugins,
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
    const offInfo = infoSources.register(musicbrainz);
    const offAi = aiSources.register(localAi);
    return () => {
      offAi();
      offLyrics();
      offInfo();
      stopHost();
    };
  },
});
