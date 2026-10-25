import { describe, expect, it } from 'vitest';
import { decode, parseDuration, parseFeed, parseSearch } from './rss';

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
<channel>
  <title>The &amp; Show</title>
  <itunes:author>Some Host</itunes:author>
  <itunes:image href="https://cdn.example.com/show.jpg"/>
  <item>
    <title><![CDATA[Episode 2: "Quotes" & more]]></title>
    <guid isPermaLink="false">ep-2</guid>
    <pubDate>Tue, 03 Mar 2026 08:00:00 GMT</pubDate>
    <enclosure url="https://tracker.example.com/e2.mp3?x=1&amp;y=2" length="123" type="audio/mpeg"/>
    <itunes:duration>1:02:03</itunes:duration>
    <description><![CDATA[<p>Hello <b>world</b> &amp; friends</p>]]></description>
    <itunes:image href="https://cdn.example.com/e2.jpg"/>
  </item>
  <item>
    <title>Episode 1</title>
    <enclosure url="https://tracker.example.com/e1.m4a" type="audio/mp4"/>
    <itunes:duration>754</itunes:duration>
  </item>
  <item><title>No audio here</title></item>
  <item><title>Bad link</title><enclosure url="javascript:alert(1)" type="audio/mpeg"/></item>
</channel>
</rss>`;

describe('parseFeed', () => {
  const feed = parseFeed(FEED);
  it('reads the show', () => {
    expect(feed.title).toBe('The & Show');
    expect(feed.author).toBe('Some Host');
    expect(feed.image).toBe('https://cdn.example.com/show.jpg');
  });
  it('reads the episodes that have audio, in the order of the feed', () => {
    expect(feed.episodes.map((e) => e.title)).toEqual(['Episode 2: "Quotes" & more', 'Episode 1']);
    const [first, second] = feed.episodes;
    expect(first).toMatchObject({
      guid: 'ep-2',
      audioUrl: 'https://tracker.example.com/e2.mp3?x=1&y=2',
      mime: 'audio/mpeg',
      durationSeconds: 3723,
      description: 'Hello world & friends',
      image: 'https://cdn.example.com/e2.jpg',
    });
    expect(first?.published).toBe(Date.UTC(2026, 2, 3, 8));
    expect(second).toMatchObject({
      guid: 'https://tracker.example.com/e1.m4a',
      durationSeconds: 754,
      published: null,
    });
  });
  it('drops anything that is not an http(s) address', () => {
    expect(feed.episodes.some((e) => e.audioUrl.startsWith('javascript:'))).toBe(false);
  });
  it('copes with text that is not a feed', () => {
    expect(parseFeed('<html>nope</html>').episodes).toEqual([]);
    expect(parseFeed('').title).toBe('Podcast');
  });
});

describe('details', () => {
  it('reads durations in the forms feeds use', () => {
    expect(parseDuration('1:02:03')).toBe(3723);
    expect(parseDuration('62:03')).toBe(3723);
    expect(parseDuration('3723')).toBe(3723);
    expect(parseDuration('')).toBe(0);
    expect(parseDuration('soon')).toBe(0);
    expect(parseDuration('1:2:3:4')).toBe(0);
  });
  it('decodes entities and CDATA, and leaves unknown ones alone', () => {
    expect(decode('a &amp; b &lt;3 &#33; &#x41; &unknown;')).toBe('a & b <3 ! A &unknown;');
    expect(decode('<![CDATA[x & y]]>')).toBe('x & y');
    expect(decode('&#99999999999;')).toBe('&#99999999999;');
  });
  it('reads search results and skips those without a feed', () => {
    const hits = parseSearch(
      JSON.stringify({
        results: [
          {
            collectionName: 'Show A',
            artistName: 'Host',
            feedUrl: 'https://a.example.com/feed.xml',
            artworkUrl600: 'https://i.example.com/a.jpg',
          },
          { collectionName: 'No feed' },
        ],
      }),
    );
    expect(hits).toEqual([
      {
        title: 'Show A',
        author: 'Host',
        feedUrl: 'https://a.example.com/feed.xml',
        image: 'https://i.example.com/a.jpg',
      },
    ]);
    expect(parseSearch('not json')).toEqual([]);
  });
});
