import { cn } from '@melodesk/ui';
import { useEffect, useRef, useState } from 'react';
import { BAND_COUNT, getLevelSource, subscribeLevels, type Levels } from '../../core';
import { useT, type MessageKey } from '../../i18n/index';

type Mode = 'bars' | 'wave' | 'ring';
const MODES: { id: Mode; label: MessageKey }[] = [
  { id: 'bars', label: 'visualizer.bars' },
  { id: 'wave', label: 'visualizer.wave' },
  { id: 'ring', label: 'visualizer.ring' },
];
const MODE_KEY = 'melodesk.visualizer';

function readMode(): Mode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === 'wave' || v === 'ring' ? v : 'bars';
  } catch {
    return 'bars';
  }
}

/** The spectrum folded to `n` points by interpolating between neighbouring bands. */
function sample(levels: Levels, at: number): number {
  const x = at * (BAND_COUNT - 1);
  const i = Math.floor(x);
  const a = levels.bands[i] ?? 0;
  const b = levels.bands[Math.min(BAND_COUNT - 1, i + 1)] ?? 0;
  return a + (b - a) * (x - i);
}

function draw(
  ctx: CanvasRenderingContext2D,
  mode: Mode,
  w: number,
  h: number,
  levels: Levels,
  color: string,
  peaks: Float32Array,
  nowMs: number,
): void {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  if (mode === 'bars') {
    const n = Math.max(16, Math.min(64, Math.floor(w / 14)));
    const slot = w / n;
    const bar = slot * 0.62;
    const gradient = ctx.createLinearGradient(0, h, 0, 0);
    gradient.addColorStop(0, color);
    gradient.addColorStop(1, `color-mix(in srgb, ${color} 35%, transparent)`);
    for (let j = 0; j < n; j += 1) {
      const v = sample(levels, j / (n - 1));
      peaks[j] = Math.max(v, (peaks[j] ?? 0) - 0.012);
      const height = Math.max(4, v * h * 0.92);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.roundRect(j * slot + (slot - bar) / 2, h - height, bar, height, bar / 2);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(j * slot + (slot - bar) / 2, h - (peaks[j] ?? 0) * h * 0.92 - 6, bar, 2);
      ctx.globalAlpha = 1;
    }
  } else if (mode === 'wave') {
    const mid = h / 2;
    const n = 48;
    const points = Array.from({ length: n }, (_, j) => ({
      x: (j / (n - 1)) * w,
      y: sample(levels, j / (n - 1)) * h * 0.42 + 2,
    }));
    ctx.beginPath();
    ctx.moveTo(0, mid);
    points.forEach((p, j) => {
      const prev = points[j - 1] ?? p;
      ctx.quadraticCurveTo(prev.x, mid - prev.y, (prev.x + p.x) / 2, mid - (prev.y + p.y) / 2);
    });
    ctx.lineTo(w, mid);
    for (let j = n - 1; j >= 0; j -= 1) {
      const p = points[j];
      if (!p) continue;
      const next = points[j + 1] ?? p;
      ctx.quadraticCurveTo(next.x, mid + next.y, (next.x + p.x) / 2, mid + (next.y + p.y) / 2);
    }
    ctx.closePath();
    ctx.globalAlpha = 0.55;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    const cx = w / 2;
    const cy = h / 2;
    const size = Math.min(w, h);
    const inner = size * 0.2 + levels.bass * size * 0.04;
    const n = 72;
    ctx.lineWidth = Math.max(2, size * 0.008);
    ctx.lineCap = 'round';
    const spin = nowMs / 12000;
    for (let j = 0; j < n; j += 1) {
      // Mirrored, so the ring is symmetric and the lows meet at the top and bottom.
      const t = j < n / 2 ? j / (n / 2) : 1 - (j - n / 2) / (n / 2);
      const len = 4 + sample(levels, t) * size * 0.22;
      const a = (j / n) * Math.PI * 2 + spin;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * inner, cy + Math.sin(a) * inner);
      ctx.lineTo(cx + Math.cos(a) * (inner + len), cy + Math.sin(a) * (inner + len));
      ctx.stroke();
    }
  }
}

/** The spectrum as bars, a wave or a ring, drawn straight to a canvas from the live levels. */
export function VisualizerTab() {
  const t = useT();
  const [mode, setMode] = useState<Mode>(readMode);
  const canvas = useRef<HTMLCanvasElement>(null);
  const simulated = getLevelSource()?.real === false;

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const peaks = new Float32Array(64);
    let w = 0;
    let h = 0;
    let last: Levels | null = null;
    const color = (): string => {
      const style = getComputedStyle(el);
      return (
        style.getPropertyValue('--color-accent').trim() ||
        style.getPropertyValue('--np-accent').trim() ||
        '#c4b5fd'
      );
    };
    const paint = (levels: Levels): void => {
      last = levels;
      ctx.setTransform(window.devicePixelRatio, 0, 0, window.devicePixelRatio, 0, 0);
      draw(ctx, mode, w, h, levels, color(), peaks, performance.now());
    };
    const resize = (): void => {
      const dpr = window.devicePixelRatio;
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      if (last) paint(last);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    const flat = { bands: new Float32Array(BAND_COUNT), energy: 0, bass: 0, beat: 0 };
    paint(flat);
    const off = subscribeLevels(paint);
    return () => {
      off();
      observer.disconnect();
    };
  }, [mode]);

  const choose = (next: Mode): void => {
    setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* not remembered */
    }
  };
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <div role="radiogroup" aria-label={t('nowPlaying.visualizer')} className="flex gap-1">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={mode === m.id}
            onClick={() => choose(m.id)}
            className={cn(
              'h-8 rounded-full px-3 text-xs font-medium transition-colors',
              mode === m.id ? 'bg-fg text-bg' : 'text-fg-muted hover:bg-bg-overlay hover:text-fg',
            )}
          >
            {t(m.label)}
          </button>
        ))}
      </div>
      <canvas ref={canvas} aria-hidden className="min-h-0 w-full flex-1" />
      {simulated && <p className="text-xs text-fg-subtle">{t('visualizer.simulatedNote')}</p>}
    </div>
  );
}
