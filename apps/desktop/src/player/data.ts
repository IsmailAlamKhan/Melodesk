import { nanoid } from 'nanoid';
import { sendCommand } from './ipc';

/**
 * Request/response correlation for InnerTube calls made through the player webview.
 * The bridge performs the fetch with the page's own network layer; we only ever see the
 * raw response JSON, which the adapter then parses and validates.
 */
const DEFAULT_TIMEOUT_MS = 35_000;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: number;
}

const pending = new Map<string, Pending>();

export class DataRequestError extends Error {
  override readonly name = 'DataRequestError';
  constructor(
    readonly endpoint: string,
    message: string,
  ) {
    super(`${endpoint}: ${message}`);
  }
}

export function innertube(endpoint: string, body: Record<string, unknown>): Promise<unknown> {
  const requestId = nanoid(12);
  return new Promise<unknown>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      pending.delete(requestId);
      reject(new DataRequestError(endpoint, 'timeout'));
    }, DEFAULT_TIMEOUT_MS);
    pending.set(requestId, { resolve, reject, timer });
    sendCommand({ type: 'data', requestId, endpoint, body }).catch((err: unknown) => {
      window.clearTimeout(timer);
      pending.delete(requestId);
      reject(new DataRequestError(endpoint, String(err)));
    });
  });
}

/** Called by the IPC subscriber for every validated `dataResponse` event. */
export function resolveDataResponse(
  requestId: string,
  ok: boolean,
  response: unknown,
  error?: string,
): void {
  const p = pending.get(requestId);
  if (!p) return;
  pending.delete(requestId);
  window.clearTimeout(p.timer);
  if (ok) p.resolve(response);
  else p.reject(new DataRequestError('innertube', error ?? 'unknown error'));
}

/** Fail everything in flight, e.g. when the player webview navigates away or reloads. */
export function rejectAllPending(reason: string): void {
  for (const [id, p] of pending) {
    window.clearTimeout(p.timer);
    p.reject(new DataRequestError('innertube', reason));
    pending.delete(id);
  }
}
