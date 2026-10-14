import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

/**
 * Runtime-neutral helpers for Convex functions (V8 isolate: no Node built-ins).
 * Output formats match the Postgres service and the CLI exactly.
 */

/** `sha256:` plus the first 16 hex digits (same as @agileflow/work contentHash). */
export const contentHash = (text: string) => `sha256:${bytesToHex(sha256(utf8ToBytes(text))).slice(0, 16)}`;

/** Full sha256 hex. */
export const sha256Hex = (text: string) => bytesToHex(sha256(utf8ToBytes(text)));

/** Canonical JSON (sorted keys) for request digests and plan hashes. */
export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value ?? null);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(obj[k])}`)
    .join(',')}}`;
}

export const digest = (value: unknown) => `sha256:${sha256Hex(canonical(value))}`;

const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

export function base64url(bytes: Uint8Array): string {
  let out = '';
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out += B64URL[(n >> 18) & 63]! + B64URL[(n >> 12) & 63]! + B64URL[(n >> 6) & 63]! + B64URL[n & 63]!;
  }
  const rest = bytes.length - i;
  if (rest === 1) {
    const n = bytes[i]! << 16;
    out += B64URL[(n >> 18) & 63]! + B64URL[(n >> 12) & 63]!;
  } else if (rest === 2) {
    const n = (bytes[i]! << 16) | (bytes[i + 1]! << 8);
    out += B64URL[(n >> 18) & 63]! + B64URL[(n >> 12) & 63]! + B64URL[(n >> 6) & 63]!;
  }
  return out;
}

function fromBase64url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  const out: number[] = [];
  let buf = 0;
  let bits = 0;
  for (const ch of s) {
    buf = (buf << 6) | B64URL.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out.push((buf >> bits) & 0xff);
    }
  }
  return new Uint8Array(out);
}

export const randomBytes = (n: number) => globalThis.crypto.getRandomValues(new Uint8Array(n));
export const newId = (prefix: string) => `${prefix}_${base64url(randomBytes(12))}`;
export const randomSecret = (bytes = 32) => base64url(randomBytes(bytes));

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });

/** Signed, tamper-evident opaque cursors bound to a context string. */
export class CursorCodec {
  constructor(private readonly secret: string) {}

  encode(context: string, payload: Record<string, unknown>): string {
    const body = base64url(encoder.encode(JSON.stringify({ v: 1, c: context, p: payload })));
    return `${body}.${this.sign(body)}`;
  }

  decode(context: string, cursor: string): Record<string, unknown> | null {
    const [body, sig] = String(cursor).split('.');
    if (!body || !sig) return null;
    const expected = this.sign(body);
    if (sig.length !== expected.length) return null;
    let diff = 0;
    for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i);
    if (diff !== 0) return null;
    try {
      const bytes = fromBase64url(body);
      if (!bytes) return null;
      const parsed = JSON.parse(decoder.decode(bytes)) as { v: number; c: string; p: Record<string, unknown> };
      return parsed.v === 1 && parsed.c === context ? parsed.p : null;
    } catch {
      return null;
    }
  }

  private sign(body: string): string {
    return base64url(hmac(sha256, utf8ToBytes(this.secret), utf8ToBytes(body))).slice(0, 32);
  }
}

/** Split UTF-8 text into chunks of at most `max` bytes without breaking a code point. */
export function utf8Slice(text: string, offset: number, max: number): { chunk: string; next: number | null; total: number } {
  const buf = encoder.encode(text);
  if (offset >= buf.length) return { chunk: '', next: null, total: buf.length };
  let end = Math.min(buf.length, offset + max);
  while (end < buf.length && end > offset && (buf[end]! & 0xc0) === 0x80) end--;
  return { chunk: decoder.decode(buf.subarray(offset, end)), next: end < buf.length ? end : null, total: buf.length };
}

export const byteLength = (text: string) => encoder.encode(text).length;
