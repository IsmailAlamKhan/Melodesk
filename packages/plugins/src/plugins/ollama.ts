import { definePlugin, type PluginTrack } from '../sdk';

interface Guess {
  title: string;
  artist: string;
}

const DEFAULT_URL = 'http://localhost:11434';
const DEFAULT_MODEL = 'llama3.2:3b';
const CACHE_DAYS = 90;

/** What the model is asked. It names songs; it is never asked for lyrics. */
export function buildPrompt(track: PluginTrack): string {
  const uploader = track.artist.split(' • ')[0] ?? track.artist;
  return [
    'You identify songs for a music player.',
    `The player shows a track titled ${JSON.stringify(track.title)} uploaded by ${JSON.stringify(uploader)}.`,
    'It may be a cover, a remix, a slowed or sped-up version, a live recording or a song from a film,',
    'so the title can carry extra words and the uploader may not be the original singer.',
    'Give the most likely original songs: the plain title (no "cover", "from the film", "official video"',
    'or similar) and the original artist(s). At most three, most likely first. If you are not sure, still',
    'give your best guess for the first one. Do not write lyrics.',
    'Reply with JSON only, in exactly this shape: {"songs":[{"title":"...","artist":"..."}]}',
  ].join(' ');
}

/** What the model is asked to explain a line. It is given the line and a little around it, no more. */
export function buildExplainPrompt(
  track: PluginTrack,
  line: string,
  context: readonly string[],
): string {
  const uploader = track.artist.split(' • ')[0] ?? track.artist;
  return [
    'You help someone understand song lyrics.',
    `The song is ${JSON.stringify(track.title)} by ${JSON.stringify(uploader)}.`,
    `The line is ${JSON.stringify(line)}.`,
    context.length > 0
      ? `Nearby lines, for context only: ${JSON.stringify(context.join(' / '))}.`
      : '',
    'In at most three short sentences, say what the line means in plain language.',
    'If it is not in English, begin with an English translation. If it is an idiom or a reference, explain it.',
    'Do not quote any other lines. Reply with the explanation only.',
  ]
    .filter(Boolean)
    .join(' ');
}

/** What the model is asked to turn a playlist description into: the filter fields, as JSON. */
export function buildRulesPrompt(description: string): string {
  return [
    'You turn a description of a playlist into filter rules for a music library.',
    `The description is ${JSON.stringify(description.slice(0, 300))}.`,
    'Reply with JSON only, using only the keys that the description needs:',
    '{"text": words that must appear in the title, artist, album or genre,',
    '"genre": one genre, "yearFrom": number, "yearTo": number,',
    '"minPlays": number, "maxPlays": number (0 = never played),',
    '"notPlayedDays": number (not played in the last N days), "playedWithinDays": number,',
    '"addedWithinDays": number, "minMinutes": number, "maxMinutes": number,',
    '"sort": one of random, mostPlayed, leastPlayed, recentlyAdded, lastPlayed, title, artist,',
    '"limit": number of songs}.',
    'Do not name songs. Leave out keys that do not apply.',
  ].join(' ');
}

/** The JSON object in a model's reply, or null if it did not give one. */
export function parseJsonObject(reply: string): Record<string, unknown> | null {
  const tryParse = (text: string): Record<string, unknown> | null => {
    try {
      const v: unknown = JSON.parse(text);
      return typeof v === 'object' && v !== null && !Array.isArray(v)
        ? (v as Record<string, unknown>)
        : null;
    } catch {
      return null;
    }
  };
  const whole = tryParse(reply);
  if (whole) return whole;
  const m = /\{[\s\S]*\}/u.exec(reply);
  return m ? tryParse(m[0]) : null;
}

/** The guesses in a model's reply, or none if it did not follow the shape. */
export function parseGuesses(reply: string): Guess[] {
  let data: unknown;
  try {
    data = JSON.parse(reply);
  } catch {
    // Some models wrap the JSON in prose or a code fence.
    const m = /\{[\s\S]*\}/u.exec(reply);
    if (!m) return [];
    try {
      data = JSON.parse(m[0]);
    } catch {
      return [];
    }
  }
  const songs = (data as { songs?: unknown }).songs;
  if (!Array.isArray(songs)) return [];
  return songs
    .flatMap((s): Guess[] => {
      const o = s as { title?: unknown; artist?: unknown };
      return typeof o.title === 'string' && o.title.trim()
        ? [
            {
              title: o.title.trim().slice(0, 200),
              artist: typeof o.artist === 'string' ? o.artist.trim().slice(0, 200) : '',
            },
          ]
        : [];
    })
    .slice(0, 3);
}

/**
 * Works out which song a track really is by asking an AI model that runs on your own computer
 * (Ollama). Nothing leaves the machine and no model ships with Melodesk.
 */
export const ollama = definePlugin({
  manifest: {
    id: 'ollama',
    name: 'Local AI song finder',
    version: '1.0.0',
    description:
      'Asks an AI model running on your own computer (Ollama) which song a title really is, so lyrics can be found for covers, remixes and “From the film …” uploads, and can explain a lyric line when you ask. The title, uploader and the line go to localhost only. Needs Ollama and a small model, for example “ollama pull llama3.2:3b”.',
    permissions: ['network:fetch', 'storage:plugin'],
    hosts: ['localhost', '127.0.0.1'],
    provides: ['identify', 'explain'],
  },
  settingsFields: [
    {
      key: 'url',
      label: 'Ollama address',
      type: 'text',
      default: DEFAULT_URL,
      hint: 'Always on this computer',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'text',
      default: DEFAULT_MODEL,
      hint: 'Any model you have pulled; small ones are fast enough',
    },
  ],
  setup(ctx) {
    let status = 'Ready';
    const base = (): string => String(ctx.settings['url'] ?? DEFAULT_URL).replace(/\/+$/u, '');
    const model = (): string => String(ctx.settings['model'] ?? DEFAULT_MODEL);

    const check = async (): Promise<void> => {
      if (!ctx.fetch) return;
      try {
        const res = await ctx.fetch(`${base()}/api/tags`);
        if (!res.ok) {
          status = `Ollama answered ${String(res.status)}`;
          return;
        }
        const body = (await res.json()) as { models?: { name?: string }[] };
        const names = (body.models ?? []).map((m) => m.name ?? '');
        const wanted = model();
        status = names.some((n) => n === wanted || n.split(':')[0] === wanted)
          ? `Ready · ${wanted}`
          : `Model “${wanted}” is not installed. Run: ollama pull ${wanted}`;
      } catch {
        status = `Cannot reach Ollama at ${base()}. Is it running?`;
      }
    };
    void check();

    return {
      status: () => status,
      actions: [{ label: 'Check connection', run: check }],
      explainLyric: async ({ track, line, context }) => {
        if (!ctx.fetch) return null;
        try {
          const res = await ctx.fetch(`${base()}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: model(),
              prompt: buildExplainPrompt(track, line, context),
              stream: false,
              options: { temperature: 0.3, num_predict: 220 },
            }),
          });
          if (!res.ok) {
            status = `Ollama answered ${String(res.status)} (is “${model()}” installed?)`;
            return null;
          }
          const body = (await res.json()) as { response?: string };
          status = `Ready · ${model()}`;
          const text = (body.response ?? '').trim();
          return text ? text.slice(0, 800) : null;
        } catch {
          status = `Cannot reach Ollama at ${base()}. Is it running?`;
          return null;
        }
      },
      suggestRules: async (description) => {
        if (!ctx.fetch) return null;
        try {
          const res = await ctx.fetch(`${base()}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: model(),
              prompt: buildRulesPrompt(description),
              stream: false,
              format: 'json',
              options: { temperature: 0, num_predict: 300 },
            }),
          });
          if (!res.ok) {
            status = `Ollama answered ${String(res.status)} (is “${model()}” installed?)`;
            return null;
          }
          const body = (await res.json()) as { response?: string };
          status = `Ready · ${model()}`;
          return parseJsonObject(body.response ?? '');
        } catch {
          status = `Cannot reach Ollama at ${base()}. Is it running?`;
          return null;
        }
      },
      identifySong: async (track) => {
        if (!ctx.fetch) return [];
        const key = `ai:${track.videoId}`;
        const cached = await ctx.storage?.get<{ at: number; guesses: Guess[] }>(key);
        if (cached && Date.now() - cached.at < CACHE_DAYS * 86_400_000) return cached.guesses;
        try {
          const res = await ctx.fetch(`${base()}/api/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: model(),
              prompt: buildPrompt(track),
              stream: false,
              format: 'json',
              options: { temperature: 0, num_predict: 220 },
            }),
          });
          if (!res.ok) {
            status = `Ollama answered ${String(res.status)} (is “${model()}” installed?)`;
            return [];
          }
          const body = (await res.json()) as { response?: string };
          const guesses = parseGuesses(body.response ?? '');
          status = `Ready · ${model()}`;
          // Only worth keeping if the model produced something; a miss may be a model that was busy.
          if (guesses.length > 0) await ctx.storage?.set(key, { at: Date.now(), guesses });
          return guesses;
        } catch {
          status = `Cannot reach Ollama at ${base()}. Is it running?`;
          return [];
        }
      },
    };
  },
});
