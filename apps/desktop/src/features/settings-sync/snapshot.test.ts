import { describe, expect, it } from 'vitest';
import { buildFile, isSynced, mergeEntries, parseSyncFile, type SyncEntry } from './snapshot';

const e = (value: string, updatedAt: number): SyncEntry => ({ value, updatedAt });

describe('what is synced', () => {
  it('is preferences and lists, never paths, servers, secrets or caches', () => {
    for (const k of [
      'appearance:prefs',
      'audio:prefs',
      'lyrics:offset:abc',
      'local:smart',
      'podcasts:feeds',
    ])
      expect(isSynced(k), k).toBe(true);
    for (const k of [
      'local:folders',
      'server:config',
      'query-cache',
      'resume:last',
      'plugin:lastfm:settings',
      'sync:folder',
      'whats-new:seen',
    ])
      expect(isSynced(k), k).toBe(false);
  });
});

describe('mergeEntries', () => {
  it('takes what only the other computer has, and offers what only this one has', () => {
    const m = mergeEntries({ 'audio:prefs': e('a', 5) }, { 'lyrics:prefs': e('b', 7) });
    expect(m.apply).toEqual(['lyrics:prefs']);
    expect(m.writeFile).toBe(true);
    expect(Object.keys(m.entries).sort()).toEqual(['audio:prefs', 'lyrics:prefs']);
  });
  it('keeps the newer change of a setting changed on both', () => {
    const newerHere = mergeEntries(
      { 'audio:prefs': e('here', 9) },
      { 'audio:prefs': e('there', 5) },
    );
    expect(newerHere.apply).toEqual([]);
    expect(newerHere.writeFile).toBe(true);
    expect(newerHere.entries['audio:prefs']?.value).toBe('here');
    const newerThere = mergeEntries(
      { 'audio:prefs': e('here', 5) },
      { 'audio:prefs': e('there', 9) },
    );
    expect(newerThere.apply).toEqual(['audio:prefs']);
    expect(newerThere.writeFile).toBe(false);
    expect(newerThere.entries['audio:prefs']?.value).toBe('there');
  });
  it('needs nothing when the values are the same, whatever their times', () => {
    const m = mergeEntries({ 'audio:prefs': e('same', 9) }, { 'audio:prefs': e('same', 5) });
    expect(m).toMatchObject({ apply: [], writeFile: false });
  });
  it('settles a tie the same way on both computers', () => {
    const a = mergeEntries({ k: e('x', 5) }, { k: e('y', 5) });
    const b = mergeEntries({ k: e('y', 5) }, { k: e('x', 5) });
    expect(a.entries['k']?.value).toBe(b.entries['k']?.value);
  });
});

describe('the file', () => {
  it('reads what it wrote, and drops entries that are not synced or malformed', () => {
    const file = buildFile({ 'audio:prefs': e('{}', 3) }, 'dev1', new Date(0));
    expect(parseSyncFile(JSON.stringify(file))?.entries).toEqual({ 'audio:prefs': e('{}', 3) });
    const messy = JSON.stringify({
      ...file,
      entries: {
        'audio:prefs': e('{}', 3),
        'server:config': e('secret', 3),
        'lyrics:prefs': { value: 5, updatedAt: 1 },
        'local:smart': { value: '[]', updatedAt: 'now' },
      },
    });
    expect(Object.keys(parseSyncFile(messy)?.entries ?? {})).toEqual(['audio:prefs']);
  });
  it('is not accepted when it is not ours', () => {
    expect(parseSyncFile('nope')).toBeNull();
    expect(parseSyncFile('[]')).toBeNull();
    expect(
      parseSyncFile(JSON.stringify({ app: 'melodesk', kind: 'backup', format: 1 })),
    ).toBeNull();
    expect(parseSyncFile(JSON.stringify({ app: 'melodesk', kind: 'sync', format: 2 }))).toBeNull();
  });
});
