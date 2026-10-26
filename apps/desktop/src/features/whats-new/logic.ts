import type { Release } from './releases';

/** "1.2.3" (or "v1.2.3-beta") as numbers, or null if it is not a version. */
export function parseVersion(text: string): [number, number, number] | null {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/u.exec(text.trim());
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

/** Negative if `a` is older than `b`, positive if newer, 0 if the same (or either is not a version). */
export function compareVersions(a: string, b: string): number {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) return 0;
  for (let i = 0; i < 3; i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** What has arrived after `seen`, up to and including `current`, newest first. */
export function releasesSince(
  releases: readonly Release[],
  seen: string,
  current: string,
): Release[] {
  return releases
    .filter((r) => compareVersions(r.version, seen) > 0 && compareVersions(r.version, current) <= 0)
    .sort((a, b) => compareVersions(b.version, a.version));
}

/** What every release up to `current` added, newest first (for opening the list by hand). */
export function releasesUpTo(releases: readonly Release[], current: string): Release[] {
  return releasesSince(releases, '0.0.0', current);
}
