import { invoke } from '@tauri-apps/api/core';
import { create } from 'zustand';
import { kvGet, kvSet } from '../../data/kv';

export const DEFAULT_PORT = 7733;
const ENABLED = 'control:enabled';
const PORT = 'control:port';
const TOKEN = 'control:token';

/** A secret to put in the Authorization header: 24 random bytes, written URL-safe (32 characters). */
export function newToken(
  random: (n: number) => Uint8Array = (n) => crypto.getRandomValues(new Uint8Array(n)),
): string {
  const bytes = random(24);
  let text = '';
  for (const b of bytes) text += String.fromCharCode(b);
  return btoa(text).replace(/\+/gu, '-').replace(/\//gu, '_').replace(/=+$/u, '');
}

/** Ports the API may use. Below 1024 needs special rights on some systems. */
export const validPort = (n: number): boolean => Number.isInteger(n) && n >= 1024 && n <= 65535;

/** A command to try the API from a terminal. */
export function curlExample(port: number, token: string, what: 'now' | 'next' | 'volume'): string {
  const base = `curl -H "Authorization: Bearer ${token}"`;
  const url = `http://127.0.0.1:${String(port)}/v1`;
  if (what === 'now') return `${base} ${url}/now`;
  if (what === 'next') return `${base} -X POST ${url}/next`;
  return `${base} -X POST -d '{"volume":0.5}' ${url}/volume`;
}

interface ControlSettings {
  loaded: boolean;
  enabled: boolean;
  port: number;
  token: string;
  error: string | null;
}

export const useControl = create<ControlSettings>(() => ({
  loaded: false,
  enabled: false,
  port: DEFAULT_PORT,
  token: '',
  error: null,
}));

export async function loadControl(): Promise<void> {
  try {
    const [enabled, port, token] = await Promise.all([kvGet(ENABLED), kvGet(PORT), kvGet(TOKEN)]);
    const p = Number(port);
    useControl.setState({
      loaded: true,
      enabled: enabled === '1',
      port: validPort(p) ? p : DEFAULT_PORT,
      token: token ?? '',
    });
  } catch {
    useControl.setState({ loaded: true });
  }
}

/** Make the running server match the settings (on, off, or restarted with a new port or token). */
export async function applyControl(): Promise<void> {
  const { enabled, port, token } = useControl.getState();
  try {
    if (enabled) await invoke('control_start', { port, token });
    else await invoke('control_stop');
    useControl.setState({ error: null });
  } catch (err) {
    useControl.setState({ error: err instanceof Error ? err.message : String(err) });
  }
}

export async function setControl(
  change: Partial<Pick<ControlSettings, 'enabled' | 'port' | 'token'>>,
): Promise<void> {
  const next = { ...useControl.getState(), ...change };
  // The first time it is switched on, there must be a secret.
  if (next.enabled && !next.token) next.token = newToken();
  useControl.setState({ enabled: next.enabled, port: next.port, token: next.token });
  await Promise.all([
    kvSet(ENABLED, next.enabled ? '1' : '0'),
    kvSet(PORT, String(next.port)),
    kvSet(TOKEN, next.token),
  ]);
  await applyControl();
}
