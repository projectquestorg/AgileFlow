/**
 * Unit tests for the sha256 helpers.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import hashModule from '../../../src/lib/hash.js';

const { sha256Hex, sha256File } = hashModule;

describe('sha256Hex', () => {
  it('produces deterministic hex for a known input', () => {
    // SHA-256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
    expect(sha256Hex('hello')).toBe(
      '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824',
    );
  });

  it('treats a UTF-8 string and its Buffer equivalent as the same input', () => {
    const s = 'hello world';
    const b = Buffer.from(s, 'utf8');
    expect(sha256Hex(s)).toBe(sha256Hex(b));
  });

  it('produces different hashes for different content', () => {
    expect(sha256Hex('a')).not.toBe(sha256Hex('b'));
  });

  it('handles empty strings', () => {
    // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
    expect(sha256Hex('')).toBe(
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    );
  });

  it('throws TypeError on null with a clear message', () => {
    expect(() => sha256Hex(null)).toThrow(TypeError);
    expect(() => sha256Hex(null)).toThrow(/got null/);
  });

  it('throws TypeError on undefined with a clear message', () => {
    expect(() => sha256Hex(undefined)).toThrow(TypeError);
    expect(() => sha256Hex(undefined)).toThrow(/got undefined/);
  });
});

describe('sha256File', () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-hash-'));
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it('hashes an existing file', async () => {
    const file = path.join(scratch, 'x.txt');
    fs.writeFileSync(file, 'hello', 'utf8');
    expect(await sha256File(file)).toBe(sha256Hex('hello'));
  });

  it('returns null for missing files', async () => {
    expect(await sha256File(path.join(scratch, 'nope'))).toBeNull();
  });
});
