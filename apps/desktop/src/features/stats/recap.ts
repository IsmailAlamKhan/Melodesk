/** Pure helpers for the highlights on the Stats page. Days are local "YYYY-MM-DD" strings. */

const DAY_MS = 86_400_000;

const dayNumber = (day: string): number => {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1) / DAY_MS);
};

/** The local "YYYY-MM-DD" of a moment. */
export function localDay(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${String(d.getFullYear())}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Days in a row with listening. `current` counts back from today, or from yesterday if today has
 * nothing yet (the streak is not lost until a whole day passes); `longest` is the best run.
 */
export function streaks(
  days: readonly string[],
  today: string,
): { current: number; longest: number } {
  const set = new Set(days.map(dayNumber));
  const sorted = [...set].sort((a, b) => a - b);
  let longest = 0;
  let run = 0;
  let prev: number | null = null;
  for (const n of sorted) {
    run = prev !== null && n === prev + 1 ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = n;
  }
  const t = dayNumber(today);
  let cursor = set.has(t) ? t : set.has(t - 1) ? t - 1 : null;
  let current = 0;
  while (cursor !== null && set.has(cursor)) {
    current += 1;
    cursor -= 1;
  }
  return { current, longest };
}

/**
 * How much more (positive) or less (negative) listening there was than before, in whole percent, or
 * null when there is nothing before to compare with.
 */
export function changePercent(current: number, previous: number): number | null {
  if (!(previous > 0)) return null;
  return Math.round(((current - previous) / previous) * 100);
}

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'night';

const PART_OF_HOUR: DayPart[] = Array.from({ length: 24 }, (_, h) =>
  h >= 5 && h < 12
    ? 'morning'
    : h >= 12 && h < 17
      ? 'afternoon'
      : h >= 17 && h < 22
        ? 'evening'
        : 'night',
);

/** When in the day most listening happens, or null with no listening. `hours` is seconds per hour. */
export function dayPart(hours: readonly number[]): DayPart | null {
  const totals: Record<DayPart, number> = { morning: 0, afternoon: 0, evening: 0, night: 0 };
  hours.forEach((seconds, h) => {
    totals[PART_OF_HOUR[h] ?? 'night'] += seconds;
  });
  const best = (Object.entries(totals) as [DayPart, number][]).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] > 0 ? best[0] : null;
}
