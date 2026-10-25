import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { kvGet, kvSet } from '../../data/kv';
import { allowHosts, hostOf } from '../../net/allow';
import type { LocalTrack } from '../local-music/library';
import { remoteTrack } from '../local-music/remote';

const KEY = 'radio:stations';
export const DIRECTORY = 'https://de1.api.radio-browser.info';

export interface Station {
  name: string;
  /** The stream itself (a playlist file address is resolved to it when the station is added). */
  url: string;
}

interface Store {
  loaded: boolean;
  stations: Station[];
}

export const useStations = create<Store>(() => ({ loaded: false, stations: [] }));

const isStreamAddress = (text: string): boolean => /^https?:\/\//iu.test(text.trim());

/** The first stream address in a `.pls` or `.m3u` playlist file, or null. */
export function firstStream(text: string): string | null {
  for (const raw of text.split(/\r?\n/u)) {
    const line = raw.trim();
    const pls = /^File\d+\s*=\s*(\S+)/iu.exec(line);
    const candidate = pls?.[1] ?? (line.startsWith('#') ? '' : line);
    if (isStreamAddress(candidate)) return candidate;
  }
  return null;
}

/** Whether an address is a playlist file about a stream, rather than the stream. */
export const isPlaylistFile = (url: string): boolean => {
  try {
    return /\.(pls|m3u)$/iu.test(new URL(url).pathname);
  } catch {
    return false;
  }
};

export interface Hit {
  name: string;
  url: string;
  country: string;
  detail: string;
}

/** Results of the radio-browser.info directory. */
export function parseDirectory(json: string): Hit[] {
  try {
    const list = JSON.parse(json) as unknown;
    if (!Array.isArray(list)) return [];
    return list.flatMap((s: unknown) => {
      const o = (s ?? {}) as Record<string, unknown>;
      const url =
        typeof o['url_resolved'] === 'string' && o['url_resolved']
          ? o['url_resolved']
          : typeof o['url'] === 'string'
            ? o['url']
            : '';
      const name = typeof o['name'] === 'string' ? o['name'].trim() : '';
      if (!name || !isStreamAddress(url)) return [];
      const codec = typeof o['codec'] === 'string' ? o['codec'] : '';
      const bitrate =
        typeof o['bitrate'] === 'number' && o['bitrate'] > 0 ? `${String(o['bitrate'])} kbps` : '';
      return [
        {
          name: name.slice(0, 120),
          url,
          country: typeof o['country'] === 'string' ? o['country'] : '',
          detail: [codec, bitrate].filter(Boolean).join(' · '),
        },
      ];
    });
  } catch {
    return [];
  }
}

export const stationTrack = (s: Station): LocalTrack =>
  remoteTrack({
    key: `radio:${s.url}`,
    title: s.name,
    artist: 'Live radio',
    album: null,
    durationMs: 0,
    source: { url: s.url, live: true },
  });

async function allowChosen(stations: readonly Station[]): Promise<void> {
  await allowHosts('radio', [DIRECTORY, ...stations.map((s) => s.url)]);
}

export async function loadStations(): Promise<void> {
  try {
    const raw = await kvGet(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    const stations = Array.isArray(list)
      ? list.flatMap((s: unknown) => {
          const o = (s ?? {}) as Partial<Station>;
          return typeof o.name === 'string' && typeof o.url === 'string' && isStreamAddress(o.url)
            ? [{ name: o.name, url: o.url }]
            : [];
        })
      : [];
    useStations.setState({ loaded: true, stations });
    await allowChosen(stations);
  } catch {
    useStations.setState({ loaded: true });
  }
}

async function save(stations: Station[]): Promise<void> {
  useStations.setState({ stations });
  await kvSet(KEY, JSON.stringify(stations));
  await allowChosen(stations);
}

/** Add a station. A playlist file address is read once to find the stream in it. */
export async function addStation(name: string, address: string): Promise<Station> {
  let url = address.trim();
  if (!isStreamAddress(url))
    throw new Error('Enter a web address that starts with http:// or https://');
  const existing = useStations.getState().stations;
  if (isPlaylistFile(url)) {
    await allowHosts('radio', [DIRECTORY, url, ...existing.map((s) => s.url)]);
    const found = firstStream(await invoke<string>('net_text', { url }));
    if (!found) throw new Error('No stream was found in that playlist file.');
    url = found;
  }
  const host = hostOf(url);
  const label = name.trim();
  const station = { name: label.length > 0 ? label : (host ?? 'Radio'), url };
  await save([...existing.filter((s) => s.url !== url), station]);
  return station;
}

export async function removeStation(url: string): Promise<void> {
  await save(useStations.getState().stations.filter((s) => s.url !== url));
}

export async function searchDirectory(name: string): Promise<Hit[]> {
  const query = new URLSearchParams({
    name,
    limit: '30',
    hidebroken: 'true',
    order: 'clickcount',
    reverse: 'true',
  });
  return parseDirectory(
    await invoke<string>('net_text', {
      url: `${DIRECTORY}/json/stations/search?${query.toString()}`,
    }),
  );
}
