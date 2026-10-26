import { describe, expect, it } from 'vitest';
import { deriveKeys, formatCode, generateCode, normalizeCode, open, seal } from './crypto';

describe('sync codes', () => {
  it('are 20 characters from an alphabet without look-alikes, and differ each time', () => {
    const a = generateCode();
    expect(a).toMatch(/^[A-Z2-7]{20}$/u);
    expect(generateCode()).not.toBe(a);
  });
  it('are written in groups of four and read back however they are typed', () => {
    expect(formatCode('ABCDEFGHIJKLMNOPQRST')).toBe('ABCD-EFGH-IJKL-MNOP-QRST');
    expect(normalizeCode(' abcd-efgh ijkl-mnop-qrst ')).toBe('ABCDEFGHIJKLMNOPQRST');
    expect(normalizeCode('ABCD-EFGH-IJKL-MNOP-QRS1')).toBeNull();
    expect(normalizeCode('ABCD')).toBeNull();
  });
});

describe('the keys made from a code', () => {
  it('give the same id every time, and a different one for another code', async () => {
    const a = await deriveKeys('ABCDEFGHIJKLMNOPQRST');
    const again = await deriveKeys('ABCDEFGHIJKLMNOPQRST');
    const other = await deriveKeys('ABCDEFGHIJKLMNOPQRSU');
    expect(a.id).toMatch(/^[0-9a-f]{64}$/u);
    expect(again.id).toBe(a.id);
    expect(other.id).not.toBe(a.id);
  });

  it('seal and open text, and a wrong code opens nothing', async () => {
    const mine = await deriveKeys('ABCDEFGHIJKLMNOPQRST');
    const text = '{"plugin:lastfm:settings":"sessionKey SECRET"}';
    const sealed = await seal(mine.key, text);
    expect(sealed).not.toContain('SECRET');
    expect(await open(mine.key, sealed)).toBe(text);
    expect(await open((await deriveKeys('ZZZZZZZZZZZZZZZZZZZZ')).key, sealed)).toBeNull();
  });

  it('never seal the same text the same way twice, and refuse what was tampered with', async () => {
    const { key } = await deriveKeys('ABCDEFGHIJKLMNOPQRST');
    const one = await seal(key, 'same');
    expect(await seal(key, 'same')).not.toBe(one);
    const data = JSON.parse(one) as { ct: string };
    const flipped = JSON.stringify({
      ...data,
      v: 1,
      iv: (JSON.parse(one) as { iv: string }).iv,
      ct: `A${data.ct.slice(1)}`,
    });
    expect(await open(key, flipped)).toBeNull();
    expect(await open(key, 'not json')).toBeNull();
    expect(await open(key, '{"v":2}')).toBeNull();
  });
});
