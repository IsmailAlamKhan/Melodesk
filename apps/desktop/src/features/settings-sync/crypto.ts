/**
 * The encryption behind the Melodesk sync server. Everything sent to the server is encrypted here first,
 * with a key made from a *sync code* that only the person's own computers know, so the server (and
 * whoever runs it) sees an unreadable blob under an id it cannot tie to anyone.
 *
 * From the code, PBKDF2 makes 64 bytes: the first half signs the fixed text "melodesk-id" to give the
 * id under which the blob is kept (so the id does not reveal the key), the second half is the AES-GCM key.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const CODE_LENGTH = 20;
const SALT = new TextEncoder().encode('melodesk-sync-v1');
const ITERATIONS = 200_000;

/** A new random sync code: 20 characters, 100 bits, from an alphabet without look-alikes (0/O, 1/I). */
export function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(CODE_LENGTH));
  // 256 is a multiple of 32, so every letter is equally likely.
  return Array.from(bytes, (b) => ALPHABET.charAt(b % 32)).join('');
}

/** The code as people write it down: groups of four. */
export const formatCode = (code: string): string => code.match(/.{1,4}/gu)?.join('-') ?? code;

/** A code as typed (any case, with or without dashes and spaces), or null if it is not one. */
export function normalizeCode(text: string): string | null {
  const code = text.replace(/[\s-]/gu, '').toUpperCase();
  return code.length === CODE_LENGTH && Array.from(code).every((c) => ALPHABET.includes(c))
    ? code
    : null;
}

export interface Keys {
  /** Where on the server this person's blob is kept. */
  id: string;
  key: CryptoKey;
}

const hex = (bytes: ArrayBuffer): string =>
  Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

export async function deriveKeys(code: string): Promise<Keys> {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(code),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: SALT, iterations: ITERATIONS },
    material,
    512,
  );
  const idKey = await crypto.subtle.importKey(
    'raw',
    bits.slice(0, 32),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const id = hex(await crypto.subtle.sign('HMAC', idKey, new TextEncoder().encode('melodesk-id')));
  const key = await crypto.subtle.importKey('raw', bits.slice(32), 'AES-GCM', false, [
    'encrypt',
    'decrypt',
  ]);
  return { id, key };
}

const toBase64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string): Uint8Array<ArrayBuffer> =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

/** Encrypt text. Each time uses a fresh random nonce, so the same text never looks the same twice. */
export async function seal(key: CryptoKey, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(text),
  );
  return JSON.stringify({ v: 1, iv: toBase64(iv), ct: toBase64(new Uint8Array(cipher)) });
}

/** Decrypt what `seal` made; null if it is not that, or the key is wrong (a wrong code). */
export async function open(key: CryptoKey, sealed: string): Promise<string | null> {
  try {
    const data = JSON.parse(sealed) as { v?: number; iv?: string; ct?: string };
    if (data.v !== 1 || typeof data.iv !== 'string' || typeof data.ct !== 'string') return null;
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64(data.iv) },
      key,
      fromBase64(data.ct),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
