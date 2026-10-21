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
    // Fetch the bytes and draw them from a local object URL. Reading pixels from a cross-origin
    // <img> taints the canvas unless the browser's cached copy came from a CORS request, and the
    // same cover has usually just been shown by a plain <img>, which is exactly that case.
    let objectUrl: string | null = null;
    const draw = (img: HTMLImageElement): void => {
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
        done(null);
      }
    };
    void fetch(url, { mode: 'cors', credentials: 'omit', referrerPolicy: 'no-referrer' })
      .then((res) => (res.ok ? res.blob() : Promise.reject(new Error(String(res.status)))))
      .then((blob) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(blob);
        const img = new Image();
        img.onload = () => draw(img);
        img.onerror = () => done(null);
        img.src = objectUrl;
      })
      .catch(() => done(null));
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url]);
  return url && sampled?.url === url ? sampled.rgb : null;
}
