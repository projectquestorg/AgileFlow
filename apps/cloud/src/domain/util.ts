import crypto from 'node:crypto';
import { contentHash } from '@agileflow/work';

export { contentHash };

export const newId = (prefix: string) => `${prefix}_${crypto.randomBytes(12).toString('base64url')}`;

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

export const digest = (value: unknown) => `sha256:${crypto.createHash('sha256').update(canonical(value)).digest('hex')}`;

export const hashSecret = (secret: string) => crypto.createHash('sha256').update(secret).digest('hex');

export const randomSecret = (bytes = 32) => crypto.randomBytes(bytes).toString('base64url');

/** Signed, tamper-evident opaque cursors bound to a context string. */
export class CursorCodec {
  constructor(private readonly secret: string) {}

  encode(context: string, payload: Record<string, unknown>): string {
    const body = Buffer.from(JSON.stringify({ v: 1, c: context, p: payload })).toString('base64url');
    return `${body}.${this.sign(body)}`;
  }

  decode(context: string, cursor: string): Record<string, unknown> | null {
    const [body, sig] = cursor.split('.');
    if (!body || !sig) return null;
    const expected = this.sign(body);
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    try {
      const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { v: number; c: string; p: Record<string, unknown> };
      return parsed.v === 1 && parsed.c === context ? parsed.p : null;
    } catch {
      return null;
    }
  }

  private sign(body: string): string {
    return crypto.createHmac('sha256', this.secret).update(body).digest('base64url').slice(0, 32);
  }
}

/** Split UTF-8 text into chunks of at most `max` bytes without breaking a code point. */
export function utf8Slice(text: string, offset: number, max: number): { chunk: string; next: number | null; total: number } {
  const buf = Buffer.from(text, 'utf8');
  if (offset >= buf.length) return { chunk: '', next: null, total: buf.length };
  let end = Math.min(buf.length, offset + max);
  // Back off continuation bytes (10xxxxxx) so the chunk ends on a boundary.
  while (end < buf.length && end > offset && (buf[end]! & 0xc0) === 0x80) end--;
  return { chunk: buf.subarray(offset, end).toString('utf8'), next: end < buf.length ? end : null, total: buf.length };
}
