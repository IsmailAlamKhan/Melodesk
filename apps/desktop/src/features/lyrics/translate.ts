/**
 * Lyrics translation through an opt-in provider.
 *
 * - `mymemory`: the free MyMemory API (api.mymemory.translated.net). The lyric text is sent to
 *   it, so the UI asks for consent first.
 * - `libretranslate`: a LibreTranslate server you run yourself on this machine (localhost
 *   only), so nothing leaves your computer.
 */
import { chunkLines } from './rows';

export type Provider = 'mymemory' | 'libretranslate';

export interface TranslateConfig {
  provider: Provider;
  /** BCP-47-ish code, e.g. "en", "zh-CN". */
  target: string;
  /** "auto" or a language code. Needed for romanized text (e.g. Hinglish) which cannot be detected. */
  source: string;
  libreUrl: string;
  libreKey: string;
}

export type Fetcher = (
  url: string,
  init?: { method?: 'GET' | 'POST'; headers?: Record<string, string>; body?: string },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export type TranslateErrorCode =
  'quota' | 'network' | 'libreAddress' | 'libreLocalOnly' | 'sameLanguage' | 'provider';

/** `kind` groups errors for callers; `code` + `detail` let the UI show a localized message. */
export class TranslateError extends Error {
  override readonly name = 'TranslateError';
  constructor(
    readonly kind: 'quota' | 'network' | 'config' | 'provider',
    message: string,
    readonly code: TranslateErrorCode = 'provider',
    readonly detail = '',
  ) {
    super(message);
  }
}

export const LANGUAGES: { code: string; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'bn', label: 'Bengali' },
  { code: 'hi', label: 'Hindi' },
  { code: 'ur', label: 'Urdu' },
  { code: 'pa', label: 'Punjabi' },
  { code: 'ta', label: 'Tamil' },
  { code: 'te', label: 'Telugu' },
  { code: 'mr', label: 'Marathi' },
  { code: 'ar', label: 'Arabic' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'it', label: 'Italian' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'ru', label: 'Russian' },
  { code: 'tr', label: 'Turkish' },
  { code: 'id', label: 'Indonesian' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh-CN', label: 'Chinese (Simplified)' },
];

const MYMEMORY_MAX_BYTES = 450;
const PARALLEL = 3;

export function validateConfig(c: TranslateConfig): void {
  if (c.provider === 'libretranslate') {
    let u: URL;
    try {
      u = new URL(c.libreUrl);
    } catch {
      throw new TranslateError(
        'config',
        'Enter your LibreTranslate address, e.g. http://localhost:5000',
        'libreAddress',
      );
    }
    if (u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
      throw new TranslateError(
        'config',
        'Only a LibreTranslate server on this computer (localhost) is allowed.',
        'libreLocalOnly',
      );
    }
  }
  if (c.source !== 'auto' && c.source === c.target)
    throw new TranslateError(
      'config',
      'The song language and the target language are the same.',
      'sameLanguage',
    );
}

async function myMemory(lines: string[], c: TranslateConfig, f: Fetcher): Promise<string[]> {
  const pair = `${c.source === 'auto' ? 'Autodetect' : c.source}|${c.target}`;
  const one = async (text: string): Promise<{ status: number; text: string }> => {
    const url = `https://api.mymemory.translated.net/get?${new URLSearchParams({ q: text, langpair: pair }).toString()}`;
    let res;
    try {
      res = await f(url);
    } catch (e) {
      throw new TranslateError(
        'network',
        `Could not reach the translation service (${String(e)})`,
        'network',
        String(e),
      );
    }
    const body = (await res.json()) as {
      responseStatus?: number | string;
      responseData?: { translatedText?: string };
      quotaFinished?: boolean;
      responseDetails?: string;
    };
    const status = Number(body.responseStatus ?? res.status);
    if (res.status === 429 || body.quotaFinished === true)
      throw new TranslateError(
        'quota',
        'Today’s free translation quota is used up. Try again tomorrow or use a local LibreTranslate.',
        'quota',
      );
    return { status, text: body.responseData?.translatedText ?? '' };
  };
  const out = [...lines];
  const chunks = chunkLines(
    lines.map((l) => l.trim()),
    MYMEMORY_MAX_BYTES,
  ).filter((ch) => ch.lines.some((l) => l !== ''));
  let next = 0;
  const worker = async (): Promise<void> => {
    while (next < chunks.length) {
      const ch = chunks[next];
      next += 1;
      if (!ch) break;
      const r = await one(ch.lines.join('\n'));
      // 403 "distinct languages": already in the target language, leave the lines as they are.
      if (r.status === 403) continue;
      if (r.status !== 200)
        throw new TranslateError(
          'provider',
          `Translation failed (${String(r.status)})`,
          'provider',
          String(r.status),
        );
      const parts = r.text.split('\n');
      if (parts.length === ch.lines.length) {
        parts.forEach((p, i) => {
          out[ch.start + i] = p;
        });
      } else {
        // Alignment lost: translate line by line for this chunk.
        for (const [i, line] of ch.lines.entries()) {
          if (!line) continue;
          const single = await one(line);
          if (single.status === 200) out[ch.start + i] = single.text;
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL, chunks.length) }, () => worker()));
  return out;
}

async function libre(lines: string[], c: TranslateConfig, f: Fetcher): Promise<string[]> {
  const idx = lines.map((l, i) => (l.trim() ? i : -1)).filter((i) => i >= 0);
  const res = await f(`${c.libreUrl.replace(/\/+$/u, '')}/translate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      q: idx.map((i) => lines[i]),
      source: c.source,
      target: c.target,
      format: 'text',
      ...(c.libreKey ? { api_key: c.libreKey } : {}),
    }),
  }).catch((e: unknown) => {
    throw new TranslateError(
      'network',
      `Could not reach LibreTranslate at ${c.libreUrl} (${String(e)})`,
      'network',
      String(e),
    );
  });
  const body = (await res.json()) as { translatedText?: string[] | string; error?: string };
  if (!res.ok || !body.translatedText)
    throw new TranslateError(
      'provider',
      body.error ?? `LibreTranslate error ${String(res.status)}`,
      'provider',
      body.error ?? String(res.status),
    );
  const list = Array.isArray(body.translatedText) ? body.translatedText : [body.translatedText];
  const out = [...lines];
  idx.forEach((lineIndex, k) => {
    out[lineIndex] = list[k] ?? lines[lineIndex] ?? '';
  });
  return out;
}

/** Translate lines, returning an array of the same length (blank lines stay blank). */
export async function translateLines(
  lines: string[],
  config: TranslateConfig,
  f: Fetcher,
): Promise<string[]> {
  validateConfig(config);
  return config.provider === 'mymemory' ? myMemory(lines, config, f) : libre(lines, config, f);
}
