/**
 * Reading a podcast feed (RSS with the iTunes tags most feeds carry). A feed is untrusted text from
 * anywhere, so it is read with plain string matching, never handed to anything that runs it, and every
 * piece is cut to a sensible size.
 */
export interface Episode {
  /** The feed's id for it; falls back to the audio address. */
  guid: string;
  title: string;
  /** What to play. */
  audioUrl: string;
  mime: string;
  /** 0 when the feed does not say. */
  durationSeconds: number;
  published: number | null;
  description: string;
  image: string | null;
}

export interface Feed {
  title: string;
  author: string;
  image: string | null;
  episodes: Episode[];
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

export function decode(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/gu, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/giu, (m, e: string) => {
      if (e.startsWith('#x') || e.startsWith('#X'))
        return safeChar(Number.parseInt(e.slice(2), 16), m);
      if (e.startsWith('#')) return safeChar(Number.parseInt(e.slice(1), 10), m);
      return ENTITIES[e.toLowerCase()] ?? m;
    });
}

const safeChar = (code: number, fallback: string): string =>
  Number.isFinite(code) && code > 0 && code < 0x110000 ? String.fromCodePoint(code) : fallback;

/** The text of the first <name>…</name> in `xml`, decoded and trimmed (namespaces like itunes:author work). */
function tag(xml: string, name: string): string {
  const m = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'iu').exec(xml);
  return m ? decode(m[1] ?? '').trim() : '';
}

/** The value of attribute `attr` in the first <name …> tag. */
function attribute(xml: string, name: string, attr: string): string {
  const m = new RegExp(`<${name}\\b([^>]*)>`, 'iu').exec(xml);
  if (!m) return '';
  const a = new RegExp(`\\b${attr}\\s*=\\s*("([^"]*)"|'([^']*)')`, 'iu').exec(m[1] ?? '');
  return decode(a?.[2] ?? a?.[3] ?? '').trim();
}

const plain = (html: string, max: number): string =>
  decode(html.replace(/<[^>]*>/gu, ' '))
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, max);

/** "1:02:03", "62:03" or "3723" as seconds (0 if it is none of them). */
export function parseDuration(text: string): number {
  const t = text.trim();
  if (!t) return 0;
  const parts = t.split(':').map((p) => Number(p));
  if (parts.length > 3 || parts.some((n) => !Number.isFinite(n) || n < 0)) return 0;
  return Math.round(parts.reduce((total, n) => total * 60 + n, 0));
}

const https = (url: string): string | null => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null;
  } catch {
    return null;
  }
};

const MAX_EPISODES = 500;

export function parseFeed(xml: string): Feed {
  const itemStart = xml.search(/<item[\s>]/iu);
  const head = itemStart < 0 ? xml : xml.slice(0, itemStart);
  const items = xml.match(/<item[\s>][\s\S]*?<\/item>/giu) ?? [];
  const episodes: Episode[] = [];
  for (const item of items.slice(0, MAX_EPISODES)) {
    const audioUrl = https(attribute(item, 'enclosure', 'url'));
    if (!audioUrl) continue;
    const when = Date.parse(tag(item, 'pubDate'));
    episodes.push({
      guid: tag(item, 'guid') || audioUrl,
      title: plain(tag(item, 'title'), 300) || 'Episode',
      audioUrl,
      mime: attribute(item, 'enclosure', 'type') || 'audio/mpeg',
      durationSeconds: parseDuration(tag(item, 'itunes:duration')),
      published: Number.isFinite(when) ? when : null,
      description: plain(tag(item, 'description') || tag(item, 'itunes:summary'), 600),
      image: https(attribute(item, 'itunes:image', 'href')),
    });
  }
  const channelImage = attribute(head, 'itunes:image', 'href') || tag(tag(head, 'image'), 'url');
  return {
    title: plain(tag(head, 'title'), 200) || 'Podcast',
    author: plain(tag(head, 'itunes:author') || tag(head, 'author'), 200),
    image: https(channelImage),
    episodes,
  };
}

export interface PodcastHit {
  title: string;
  author: string;
  feedUrl: string;
  image: string | null;
}

const text = (v: unknown): string => (typeof v === 'string' ? v : '');

/** Results of the iTunes podcast directory search. */
export function parseSearch(json: string): PodcastHit[] {
  try {
    const results = ((JSON.parse(json) as { results?: unknown }).results ?? []) as Record<
      string,
      unknown
    >[];
    return results.flatMap((r) => {
      const feed = typeof r['feedUrl'] === 'string' ? https(r['feedUrl']) : null;
      if (!feed) return [];
      return [
        {
          title: plain(text(r['collectionName']) || text(r['trackName']), 200) || 'Podcast',
          author: plain(text(r['artistName']), 200),
          feedUrl: feed,
          image: typeof r['artworkUrl600'] === 'string' ? https(r['artworkUrl600']) : null,
        },
      ];
    });
  } catch {
    return [];
  }
}
