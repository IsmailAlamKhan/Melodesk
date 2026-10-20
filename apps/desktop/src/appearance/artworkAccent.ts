import { useEffect, useState } from 'react';
import type { Rgb } from './color';

/** Average saturated color of an image (skipping greys), or null if it can't be read. */
export function useArtworkColor(url: string | null): Rgb | null {
  const [sampled, setSampled] = useState<{ url: string; rgb: Rgb | null } | null>(null);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const done = (rgb: Rgb | null): void => {
      if (!cancelled) setSampled({ url, rgb });
    };
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = 16;
        canvas.height = 16;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          done(null);
          return;
        }
        ctx.drawImage(img, 0, 0, 16, 16);
        const data = ctx.getImageData(0, 0, 16, 16).data;
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          const [cr, cg, cb] = [data[i] ?? 0, data[i + 1] ?? 0, data[i + 2] ?? 0];
          if (Math.max(cr, cg, cb) - Math.min(cr, cg, cb) < 24) continue;
          r += cr;
          g += cg;
          b += cb;
          n += 1;
        }
        done(n ? [r / n, g / n, b / n] : null);
      } catch {
        done(null); // tainted canvas: the image host sent no CORS headers
      }
    };
    img.onerror = () => done(null);
    img.src = url;
    return () => {
      cancelled = true;
    };
  }, [url]);
  return url && sampled?.url === url ? sampled.rgb : null;
}
