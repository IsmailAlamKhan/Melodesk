import { invoke } from '@tauri-apps/api/core';

/**
 * The web addresses the user has added themselves (a music server, podcast feeds, radio stations).
 * Rust only fetches from these (src-tauri/src/net.rs), so each source says which hosts it uses and the
 * union is sent over whenever it changes.
 */
const bySource = new Map<string, string[]>();

/** The `host` or `host:port` of a web address, or null if it is not one. */
export function hostOf(address: string): string | null {
  try {
    const url = new URL(address);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.host : null;
  } catch {
    return null;
  }
}

export async function allowHosts(source: string, addresses: readonly string[]): Promise<void> {
  bySource.set(
    source,
    addresses.flatMap((a) => {
      const host = hostOf(a);
      return host ? [host] : [];
    }),
  );
  await invoke('net_allow', { hosts: [...new Set([...bySource.values()].flat())] });
}
