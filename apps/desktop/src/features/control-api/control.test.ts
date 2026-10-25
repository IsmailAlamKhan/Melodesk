import { describe, expect, it } from 'vitest';
import { curlExample, newToken, validPort } from './control';

describe('control API settings', () => {
  it('makes a long URL-safe token, and a different one each time', () => {
    const a = newToken();
    const b = newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{32}$/u);
    expect(a).not.toBe(b);
  });
  it('encodes the bytes it is given', () => {
    expect(newToken(() => new Uint8Array(24).fill(255))).toBe('_'.repeat(32));
    expect(newToken(() => new Uint8Array(24))).toBe('A'.repeat(32));
  });
  it('accepts only ports from 1024 up', () => {
    expect(validPort(7733)).toBe(true);
    expect(validPort(1024)).toBe(true);
    expect(validPort(80)).toBe(false);
    expect(validPort(70000)).toBe(false);
    expect(validPort(7733.5)).toBe(false);
    expect(validPort(Number.NaN)).toBe(false);
  });
  it('gives commands to try it', () => {
    expect(curlExample(7733, 'T', 'now')).toBe(
      'curl -H "Authorization: Bearer T" http://127.0.0.1:7733/v1/now',
    );
    expect(curlExample(7733, 'T', 'next')).toContain('-X POST');
    expect(curlExample(7733, 'T', 'volume')).toContain('{"volume":0.5}');
  });
});
