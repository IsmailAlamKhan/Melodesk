import { useEffect, useState, type ImgHTMLAttributes } from 'react';
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

  useEffect(() => {
    const url = stored?.url;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [stored]);

  return (
    <img
      {...rest}
      src={shown ?? undefined}
      onLoad={(e) => {
        if (src && shown === src) remember(src);
        onLoad?.(e);
      }}
      onError={(e) => {
        if (src && shown === src)
          void getCached(src).then((blob) => {
            if (blob) setStored({ for: src, url: URL.createObjectURL(blob) });
          });
        onError?.(e);
      }}
    />
  );
}
