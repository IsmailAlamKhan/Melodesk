import { supportsCors } from '../../core/imageHosts';

export interface LyricCardInput {
  line: string;
  title: string;
  artist: string;
  artworkUrl: string | null;
}

const SIZE = 1080;
const PAD = 90;

/** Breaks `text` into lines no wider than `maxWidth` in the context's current font. */
export function wrapLines(
  measure: (s: string) => number,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = current ? `${current} ${word}` : word;
    if (current && measure(next) > maxWidth) {
      lines.push(current);
      current = word;
    } else current = next;
  }
  if (current) lines.push(current);
  return lines;
}

async function loadCover(url: string | null): Promise<ImageBitmap | null> {
  // Only hosts that allow it can be drawn without tainting the canvas; the others get a gradient.
  if (!url || !supportsCors(url)) return null;
  try {
    const res = await fetch(url, { referrerPolicy: 'no-referrer' });
    if (!res.ok) return null;
    return await createImageBitmap(await res.blob());
  } catch {
    return null;
  }
}

/** A square picture of one lyric line over the song's cover (or a plain gradient), ready to share. */
export async function renderLyricCard(input: LyricCardInput): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas unavailable');

  const cover = await loadCover(input.artworkUrl);
  if (cover) {
    // Fill the square with the cover, then dim it so the text stays readable.
    const scale = Math.max(SIZE / cover.width, SIZE / cover.height);
    const w = cover.width * scale;
    const h = cover.height * scale;
    ctx.filter = 'blur(40px)';
    ctx.drawImage(cover, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
    ctx.filter = 'none';
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, 0, SIZE, SIZE);
  } else {
    const g = ctx.createLinearGradient(0, 0, SIZE, SIZE);
    g.addColorStop(0, '#1f2a44');
    g.addColorStop(1, '#3b1f44');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, SIZE, SIZE);
  }

  const family = 'system-ui, -apple-system, "Segoe UI", sans-serif';
  const maxWidth = SIZE - PAD * 2;
  let fontSize = 76;
  let lines: string[] = [];
  for (; fontSize >= 40; fontSize -= 4) {
    ctx.font = `700 ${String(fontSize)}px ${family}`;
    lines = wrapLines((s) => ctx.measureText(s).width, input.line, maxWidth);
    if (lines.length * fontSize * 1.25 <= SIZE - PAD * 2 - 200) break;
  }

  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'top';
  const lineHeight = fontSize * 1.25;
  const top = (SIZE - lines.length * lineHeight) / 2 - 40;
  lines.forEach((l, i) => ctx.fillText(l, PAD, top + i * lineHeight));

  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.font = `600 34px ${family}`;
  ctx.fillText(input.title, PAD, SIZE - PAD - 80, maxWidth);
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.font = `400 30px ${family}`;
  ctx.fillText(input.artist, PAD, SIZE - PAD - 30, maxWidth);

  if (cover) cover.close();
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('could not encode the picture'));
    }, 'image/png');
  });
}

/** Puts the card on the clipboard as a PNG. */
export async function copyLyricCard(input: LyricCardInput): Promise<void> {
  const blob = await renderLyricCard(input);
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
}
