import { describe, expect, it } from 'vitest';
import { md5 } from './md5';

describe('md5', () => {
  it('matches the test vectors of RFC 1321', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
    expect(md5('a')).toBe('0cc175b9c0f1b6a831c399e269772661');
    expect(md5('abc')).toBe('900150983cd24fb0d6963f7d28e17f72');
    expect(md5('message digest')).toBe('f96b697d7cb7938d525a2f31aaf161d0');
    expect(md5('abcdefghijklmnopqrstuvwxyz')).toBe('c3fcd3d76192e4007dfb496cca67e13b');
    expect(md5('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789')).toBe(
      'd174ab98d277d9f5a5611c2c9f419d9f',
    );
    expect(
      md5('12345678901234567890123456789012345678901234567890123456789012345678901234567890'),
    ).toBe('57edf4a22be3c955ac49da2e2107b67a');
  });
  it('handles text that is not ASCII, and lengths around the block size', () => {
    expect(md5('héllo')).toBe('be50e8478cf24ff3595bc7307fb91b50');
    for (const n of [55, 56, 57, 63, 64, 65, 119, 120])
      expect(md5('x'.repeat(n))).toMatch(/^[0-9a-f]{32}$/u);
    // Subsonic's own example: md5("sesame" + "c19b2d") = 26719a1196d2a940705a59634eb18eab
    expect(md5('sesamec19b2d')).toBe('26719a1196d2a940705a59634eb18eab');
  });
});
