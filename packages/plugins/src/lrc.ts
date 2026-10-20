import type { LyricsLine } from './sdk';

/** Parse LRC text ("[mm:ss.xx] line") into timed lines. */
export function parseLrc(lrc: string): LyricsLine[] {
  const lines: { startMs: number; text: string }[] = [];
  for (const raw of lrc.split(/\r?\n/u)) {
    const stamps = [...raw.matchAll(/\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/gu)];
    if (!stamps.length) continue;
    const text = raw.replace(/\[[^\]]*\]/gu, '').trim();
    for (const m of stamps) {
      const min = Number(m[1]);
      const sec = Number(m[2]);
      const fracRaw = m[3] ?? '0';
      const frac = Number(fracRaw.padEnd(3, '0').slice(0, 3));
      lines.push({ startMs: (min * 60 + sec) * 1000 + frac, text });
    }
  }
  lines.sort((a, b) => a.startMs - b.startMs);
  return lines.map((l, i) => ({
    startMs: l.startMs,
    endMs: lines[i + 1]?.startMs ?? l.startMs + 5000,
    text: l.text,
  }));
}
