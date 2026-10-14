import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { utf8ToBytes } from '@noble/hashes/utils.js';

/**
 * Svix (Clerk webhooks) signature check over the raw body, with a 5-minute
 * timestamp window. Runtime-neutral port of verifySvix in src/domain/webhooks.ts.
 */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function base64Decode(s: string): Uint8Array | null {
  const clean = s.replace(/=+$/, '');
  if (!/^[A-Za-z0-9+/]*$/.test(clean)) return null;
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of clean) {
    buf = ((buf << 6) | B64.indexOf(ch)) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export function verifySvix(secret: string, headers: { id?: string | null; timestamp?: string | null; signature?: string | null }, rawBody: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(nowSec - ts) > 300) return false;
  const key = base64Decode(secret.replace(/^whsec_/, ''));
  if (!key) return false;
  const expected = hmac(sha256, key, utf8ToBytes(`${id}.${timestamp}.${rawBody}`));
  return signature.split(' ').some((part) => {
    const [version, sig] = part.split(',', 2);
    if (version !== 'v1' || !sig) return false;
    const given = base64Decode(sig);
    return !!given && equal(given, expected);
  });
}
