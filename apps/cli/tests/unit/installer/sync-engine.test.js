/**
 * Unit tests for the sync engine — all 5 scenarios of the decision tree.
 *
 * Each test builds a minimal scratch project with _cfg/ for stashes and
 * exercises one branch. Assertions cover:
 *   - the returned SyncAction
 *   - the destination file's contents after the call
 *   - the fileIndex entry for the relative path
 *   - the stash file (when PRESERVED) with its content matching upstream
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import syncModule from '../../../src/runtime/installer/sync-engine.js';
import fileIndexModule from '../../../src/runtime/installer/file-index.js';
import hashModule from '../../../src/lib/hash.js';

const { syncFile, emptyCounters } = syncModule;
const { emptyIndex } = fileIndexModule;
const { sha256Hex } = hashModule;

const STAMP = '2026-04-20T00-00-00';

/**
 * Helper: set up the directory tree and a fresh fileIndex.
 * @param {string} scratch
 */
function setup(scratch) {
  const agileflowDir = path.join(scratch, '.agileflow');
  const cfgDir = path.join(agileflowDir, '_cfg');
  const destDir = path.join(agileflowDir, 'plugins', 'core');
  fs.mkdirSync(destDir, { recursive: true });
  return {
    agileflowDir,
    cfgDir,
    destDir,
    fileIndex: emptyIndex('4.0.0-alpha.1'),
    ops: emptyCounters(),
    timestamp: STAMP,
  };
}

describe('syncFile — scenario 1: CREATED (dest does not exist)', () => {
  /** @type {string} */ let scratch;
  beforeEach(() => { scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-sync-')); });
  afterEach(() => { fs.rmSync(scratch, { recursive: true, force: true }); });

  it('writes the file, records the hash, and returns CREATED', async () => {
    const ctx = setup(scratch);
    const dest = path.join(ctx.destDir, 'a.md');
    const action = await syncFile({
      content: 'hello world',
      dest,
      relativePath: 'plugins/core/a.md',
      fileIndex: ctx.fileIndex,
      cfgDir: ctx.cfgDir,
      timestamp: ctx.timestamp,
      ops: ctx.ops,
    });
    expect(action).toBe('created');
    expect(fs.readFileSync(dest, 'utf8')).toBe('hello world');
    expect(ctx.fileIndex.files['plugins/core/a.md']).toEqual({
      sha256: sha256Hex('hello world'),
      protected: false,
    });
    expect(ctx.ops.created).toBe(1);
    expect(ctx.ops.updated).toBe(0);
  });

  it('creates intermediate directories as needed', async () => {
    const ctx = setup(scratch);
    const dest = path.join(ctx.destDir, 'nested', 'deep', 'a.md');
    const action = await syncFile({
      content: 'x',
      dest,
      relativePath: 'plugins/core/nested/deep/a.md',
      fileIndex: ctx.fileIndex,
      cfgDir: ctx.cfgDir,
      timestamp: ctx.timestamp,
      ops: ctx.ops,
    });
    expect(action).toBe('created');
    expect(fs.existsSync(dest)).toBe(true);
  });
});

describe('syncFile — scenario 2: UPDATED via force', () => {
  /** @type {string} */ let scratch;
  beforeEach(() => { scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-sync-')); });
  afterEach(() => { fs.rmSync(scratch, { recursive: true, force: true }); });

  it('overwrites user modifications when force=true', async () => {
    const ctx = setup(scratch);
    const dest = path.join(ctx.destDir, 'a.md');
    fs.writeFileSync(dest, 'user changes', 'utf8');
    ctx.fileIndex.files['plugins/core/a.md'] = {
      sha256: 'stale-hash',
      protected: true,
    };
    const action = await syncFile({
      content: 'upstream v2',
      dest,
      relativePath: 'plugins/core/a.md',
      fileIndex: ctx.fileIndex,
      cfgDir: ctx.cfgDir,
      timestamp: ctx.timestamp,
      force: true,
      ops: ctx.ops,
    });
    expect(action).toBe('updated');
    expect(fs.readFileSync(dest, 'utf8')).toBe('upstream v2');
    expect(ctx.fileIndex.files['plugins/core/a.md']).toEqual({
      sha256: sha256Hex('upstream v2'),
      protected: false,
    });
    expect(ctx.ops.updated).toBe(1);
  });
});

describe('syncFile — scenario 3: UPDATED via baseline match', () => {
  /** @type {string} */ let scratch;
  beforeEach(() => { scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-sync-')); });
  afterEach(() => { fs.rmSync(scratch, { recursive: true, force: true }); });

  it('updates in place when dest matches the last-install baseline', async () => {
    const ctx = setup(scratch);
    const dest = path.join(ctx.destDir, 'a.md');
    fs.writeFileSync(dest, 'v1', 'utf8');
    ctx.fileIndex.files['plugins/core/a.md'] = {
      sha256: sha256Hex('v1'),
      protected: false,
    };
    const action = await syncFile({
      content: 'v2',
      dest,
      relativePath: 'plugins/core/a.md',
      fileIndex: ctx.fileIndex,
      cfgDir: ctx.cfgDir,
      timestamp: ctx.timestamp,
      ops: ctx.ops,
    });
    expect(action).toBe('updated');
    expect(fs.readFileSync(dest, 'utf8')).toBe('v2');
    expect(ctx.fileIndex.files['plugins/core/a.md'].sha256).toBe(sha256Hex('v2'));
    expect(ctx.ops.updated).toBe(1);
    expect(ctx.ops.preserved).toBe(0);
  });
});

describe('syncFile — scenario 4: UNCHANGED variants', () => {
  /** @type {string} */ let scratch;
  beforeEach(() => { scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-sync-')); });
  afterEach(() => { fs.rmSync(scratch, { recursive: true, force: true }); });

  it('skips writing when baseline matches and upstream is identical', async () => {
    const ctx = setup(scratch);
    const dest = path.join(ctx.destDir, 'a.md');
    fs.writeFileSync(dest, 'v1', 'utf8');
    const mtimeBefore = fs.statSync(dest).mtimeMs;
    ctx.fileIndex.files['plugins/core/a.md'] = {
      sha256: sha256Hex('v1'),
      protected: false,
    };
    // Tick the clock so we can reliably detect a rewrite.
    await new Promise((r) => setTimeout(r, 15));
    const action = await syncFile({
      content: 'v1',
      dest,
      relativePath: 'plugins/core/a.md',
      fileIndex: ctx.fileIndex,
      cfgDir: ctx.cfgDir,
      timestamp: ctx.timestamp,
      ops: ctx.ops,
    });
    expect(action).toBe('unchanged');
    expect(fs.statSync(dest).mtimeMs).toBe(mtimeBefore);
    expect(ctx.ops.unchanged).toBe(1);
  });

  it('auto-clears the protected flag when the protected file converges with upstream', async () => {
    const ctx = setup(scratch);
    const dest = path.join(ctx.destDir, 'a.md');
    fs.writeFileSync(dest, 'shared content', 'utf8');
    ctx.fileIndex.files['plugins/core/a.md'] = {
      sha256: 'stale-from-when-it-was-protected',
      protected: true,
    };
    const action = await syncFile({
      content: 'shared content',
      dest,
      relativePath: 'plugins/core/a.md',
      fileIndex: ctx.fileIndex,
      cfgDir: ctx.cfgDir,
      timestamp: ctx.timestamp,
      ops: ctx.ops,
    });
    expect(action).toBe('unchanged');
    expect(ctx.fileIndex.files['plugins/core/a.md'].protected).toBe(false);
    expect(ctx.fileIndex.files['plugins/core/a.md'].sha256).toBe(
      sha256Hex('shared content'),
    );
  });

  it('adopts the current hash when there is no baseline but content matches upstream', async () => {
    const ctx = setup(scratch);
    const dest = path.join(ctx.destDir, 'a.md');
    fs.writeFileSync(dest, 'shared', 'utf8');
    // no entry in fileIndex.files
    const action = await syncFile({
      content: 'shared',
      dest,
      relativePath: 'plugins/core/a.md',
      fileIndex: ctx.fileIndex,
      cfgDir: ctx.cfgDir,
      timestamp: ctx.timestamp,
      ops: ctx.ops,
    });
    expect(action).toBe('unchanged');
    expect(ctx.fileIndex.files['plugins/core/a.md']).toEqual({
      sha256: sha256Hex('shared'),
      protected: false,
    });
  });
});

describe('syncFile — scenario 5: PRESERVED (stash) variants', () => {
  /** @type {string} */ let scratch;
  beforeEach(() => { scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-sync-')); });
  afterEach(() => { fs.rmSync(scratch, { recursive: true, force: true }); });

  it('preserves user modifications: stash new, keep user file, mark protected', async () => {
    const ctx = setup(scratch);
    const dest = path.join(ctx.destDir, 'a.md');
    fs.writeFileSync(dest, 'user wrote this', 'utf8');
    // Baseline was "v1" (stale — user has diverged)
    ctx.fileIndex.files['plugins/core/a.md'] = {
      sha256: sha256Hex('v1'),
      protected: false,
    };
    const action = await syncFile({
      content: 'upstream v2',
      dest,
      relativePath: 'plugins/core/a.md',
      fileIndex: ctx.fileIndex,
      cfgDir: ctx.cfgDir,
      timestamp: ctx.timestamp,
      ops: ctx.ops,
    });
    expect(action).toBe('preserved');
    expect(fs.readFileSync(dest, 'utf8')).toBe('user wrote this');
    // Stash exists and contains the upstream content.
    const stashed = path.join(
      ctx.cfgDir, 'updates', STAMP, 'plugins/core/a.md',
    );
    expect(fs.readFileSync(stashed, 'utf8')).toBe('upstream v2');
    expect(ctx.fileIndex.files['plugins/core/a.md']).toEqual({
      sha256: sha256Hex('user wrote this'),
      protected: true,
    });
    expect(ctx.ops.preserved).toBe(1);
    expect(ctx.ops.stashed).toBe(1);
    expect(ctx.ops.updatesPath).toBeTruthy();
  });

  it('preserves and stashes when previously protected file still differs from new upstream', async () => {
    const ctx = setup(scratch);
    const dest = path.join(ctx.destDir, 'a.md');
    fs.writeFileSync(dest, 'user version', 'utf8');
    ctx.fileIndex.files['plugins/core/a.md'] = {
      sha256: sha256Hex('user version'),
      protected: true,
    };
    const action = await syncFile({
      content: 'upstream v3',
      dest,
      relativePath: 'plugins/core/a.md',
      fileIndex: ctx.fileIndex,
      cfgDir: ctx.cfgDir,
      timestamp: ctx.timestamp,
      ops: ctx.ops,
    });
    expect(action).toBe('preserved');
    expect(fs.readFileSync(dest, 'utf8')).toBe('user version');
    expect(ctx.fileIndex.files['plugins/core/a.md'].protected).toBe(true);
  });
});

describe('syncFile — binary content (Buffer)', () => {
  /** @type {string} */ let scratch;
  beforeEach(() => { scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-sync-')); });
  afterEach(() => { fs.rmSync(scratch, { recursive: true, force: true }); });

  it('writes Buffer content byte-for-byte without encoding translation', async () => {
    const ctx = setup(scratch);
    const dest = path.join(ctx.destDir, 'logo.png');
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    await syncFile({
      content: bytes,
      dest,
      relativePath: 'plugins/core/logo.png',
      fileIndex: ctx.fileIndex,
      cfgDir: ctx.cfgDir,
      timestamp: ctx.timestamp,
      ops: ctx.ops,
    });
    const written = fs.readFileSync(dest);
    expect(written.equals(bytes)).toBe(true);
  });
});

describe('emptyCounters', () => {
  it('starts all counters at zero', () => {
    const c = emptyCounters();
    expect(c).toEqual({
      created: 0, updated: 0, preserved: 0, unchanged: 0, stashed: 0, updatesPath: null,
    });
  });
});
