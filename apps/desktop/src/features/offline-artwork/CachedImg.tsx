import { useEffect, useState, type ImgHTMLAttributes } from 'react';
import { useImageRetry } from '../../core';
import { getCached, remember } from './cache';

/**
 * An <img> for remote artwork that keeps a copy for offline use: it stores the cover once it has
 * loaded, and shows the stored copy if the network one fails.
 */
export function CachedImg({
  src,
  onLoad,
  onError,
  ...rest
}: Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & { src: string | null | undefined }) {
  const [stored, setStored] = useState<{ for: string; url: string } | null>(null);
  const shown = stored && stored.for === src ? stored.url : src;
  const { key, retry } = useImageRetry(src);

  useEffect(() => {
    const url = stored?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [stored]);

  return (
    <img
      {...rest}
      key={key}
      src={shown ?? undefined}
      crossOrigin="anonymous"
      // See core/Img.tsx: no Referer, which some image hosts reject.
      referrerPolicy="no-referrer"
      onLoad={(e) => {
        e.currentTarget.style.visibility = '';
        if (src && shown === src) remember(src);
        onLoad?.(e);
      }}
      onError={(e) => {
        const img = e.currentTarget;
        if (import.meta.env.DEV) console.warn('[img] failed to load', src);
        if (src && shown === src)
          void getCached(src).then((blob) => {
            if (blob) setStored({ for: src, url: URL.createObjectURL(blob) });
            // Nothing stored either: leave the tile's plain background, not a broken-image icon.
            else {
              img.style.visibility = 'hidden';
              retry();
            }
          });
        onError?.(e);
      }}
    />
  );
}
