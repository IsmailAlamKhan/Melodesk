import { ImageDown } from 'lucide-react';
import type { ReactNode } from 'react';
import { defineFeature, ImgComponentContext } from '../../core';
import { CachedImg } from './CachedImg';
import { StorageSection } from './StorageSection';

/** Swaps the app's cover image element for one that keeps a copy for offline use. */
function OfflineImages({ children }: { children: ReactNode }) {
  return <ImgComponentContext.Provider value={CachedImg}>{children}</ImgComponentContext.Provider>;
}

export default defineFeature({
  id: 'offline-artwork',
  name: 'feature.offline-artwork.name',
  description: 'feature.offline-artwork.description',
  icon: ImageDown,
  scope: 'all',
  contributes: {
    providers: [{ id: 'offline-images', order: 10, component: OfflineImages }],
    settings: [{ id: 'storage', category: 'storage', order: 50, component: StorageSection }],
  },
});
