/**
 * Unit tests for file-index read/write.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import fileIndexModule from '../../../src/runtime/installer/file-index.js';

const { SCHEMA_VERSION, emptyIndex, readFileIndex, writeFileIndex } = fileIndexModule;

describe('emptyIndex', () => {
  it('produces a fresh index at schema v1 with the given CLI version', () => {
    const idx = emptyIndex('4.0.0-alpha.1');
    expect(idx.schema).toBe(1);
    expect(idx.version).toBe('4.0.0-alpha.1');
    expect(idx.files).toEqual({});
    expect(typeof idx.generated_at).toBe('string');
  });
});

describe('readFileIndex', () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-idx-'));
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it('returns null when the file does not exist', async () => {
    expect(await readFileIndex(path.join(scratch, 'missing.json'))).toBeNull();
  });

  it('returns null for malformed JSON', async () => {
    const p = path.join(scratch, 'bad.json');
    fs.writeFileSync(p, '{ not json');
    expect(await readFileIndex(p)).toBeNull();
  });

  it('returns null when schema version mismatches', async () => {
    const p = path.join(scratch, 'old.json');
    fs.writeFileSync(p, JSON.stringify({ schema: 0, files: {} }));
    expect(await readFileIndex(p)).toBeNull();
  });

  it('returns null when files is not an object', async () => {
    const p = path.join(scratch, 'broken.json');
    fs.writeFileSync(p, JSON.stringify({ schema: 1, files: [] }));
    expect(await readFileIndex(p)).toBeNull();
  });

  it('returns the parsed index for a valid file', async () => {
    const p = path.join(scratch, 'ok.json');
    fs.writeFileSync(
      p,
      JSON.stringify({
        schema: 1,
        generated_at: '2026-04-20T00:00:00Z',
        version: '4.0.0-alpha.1',
        files: { 'a.md': { sha256: 'abc', protected: false } },
      }),
    );
    const idx = await readFileIndex(p);
    expect(idx).not.toBeNull();
    expect(idx.files['a.md'].sha256).toBe('abc');
  });
});

describe('writeFileIndex', () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-idx-'));
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it('round-trips via read/write', async () => {
    const p = path.join(scratch, 'nested', 'files.json');
    const idx = emptyIndex('4.0.0-alpha.1');
    idx.files['a.md'] = { sha256: 'abc', protected: false };
    idx.files['b/c.md'] = { sha256: 'def', protected: true };

    await writeFileIndex(p, idx);
    const reloaded = await readFileIndex(p);
    expect(reloaded.files['a.md']).toEqual({ sha256: 'abc', protected: false });
    expect(reloaded.files['b/c.md']).toEqual({ sha256: 'def', protected: true });
  });

  it('is atomic — no .tmp-* artifact lingers on success', async () => {
    const p = path.join(scratch, 'files.json');
    await writeFileIndex(p, emptyIndex('4.0.0-alpha.1'));
    const siblings = fs.readdirSync(scratch);
    expect(siblings.filter((e) => e.includes('.tmp-'))).toEqual([]);
    expect(siblings).toContain('files.json');
  });

  it('refreshes generated_at on each write', async () => {
    const p = path.join(scratch, 'files.json');
    const idx = emptyIndex('4.0.0-alpha.1');
    idx.generated_at = '2020-01-01T00:00:00Z';
    await writeFileIndex(p, idx);
    const reloaded = await readFileIndex(p);
    expect(reloaded.generated_at).not.toBe('2020-01-01T00:00:00Z');
  });

  it('preserves schema version', async () => {
    const p = path.join(scratch, 'files.json');
    await writeFileIndex(p, emptyIndex('4.0.0-alpha.1'));
    const reloaded = await readFileIndex(p);
    expect(reloaded.schema).toBe(SCHEMA_VERSION);
  });
});
