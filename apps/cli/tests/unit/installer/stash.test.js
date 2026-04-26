/**
 * Unit tests for the stash writer — including the path-traversal guard.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import stashModule from '../../../src/runtime/installer/stash.js';

const { writeStash } = stashModule;

describe('writeStash', () => {
  /** @type {string} */
  let scratch;
  /** @type {string} */
  let cfgDir;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-stash-'));
    cfgDir = path.join(scratch, '.agileflow', '_cfg');
    fs.mkdirSync(cfgDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it('writes string content to the expected stash path', async () => {
    const stashed = await writeStash({
      cfgDir,
      timestamp: 'STAMP',
      relativePath: 'plugins/seo/plugin.yaml',
      content: 'id: seo',
    });
    expect(stashed).toBe(
      path.join(cfgDir, 'updates', 'STAMP', 'plugins/seo/plugin.yaml'),
    );
    expect(fs.readFileSync(stashed, 'utf8')).toBe('id: seo');
  });

  it('writes Buffer content byte-for-byte', async () => {
    const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    const stashed = await writeStash({
      cfgDir,
      timestamp: 'STAMP',
      relativePath: 'plugins/seo/logo.png',
      content: bytes,
    });
    expect(fs.readFileSync(stashed).equals(bytes)).toBe(true);
  });

  it('creates intermediate directories', async () => {
    const stashed = await writeStash({
      cfgDir,
      timestamp: 'STAMP',
      relativePath: 'plugins/seo/cookbook/deeply/nested/file.md',
      content: 'x',
    });
    expect(fs.existsSync(stashed)).toBe(true);
  });

  describe('path-traversal guard', () => {
    it('rejects relativePath with leading `..` segments', async () => {
      await expect(
        writeStash({
          cfgDir,
          timestamp: 'STAMP',
          relativePath: '../../../escaped.txt',
          content: 'malicious',
        }),
      ).rejects.toThrow(/escapes the updates directory/);

      // Confirm nothing was written outside.
      expect(fs.existsSync(path.join(scratch, 'escaped.txt'))).toBe(false);
      expect(fs.existsSync(path.join(scratch, '.agileflow', 'escaped.txt'))).toBe(false);
    });

    it('rejects absolute paths that escape the updates directory', async () => {
      await expect(
        writeStash({
          cfgDir,
          timestamp: 'STAMP',
          relativePath: '/etc/passwd',
          content: 'oops',
        }),
      ).rejects.toThrow(/escapes the updates directory/);
    });

    it('rejects relativePaths with `..` segments that resolve outside even if they look nested', async () => {
      await expect(
        writeStash({
          cfgDir,
          timestamp: 'STAMP',
          relativePath: 'plugins/../../escaped.txt',
          content: 'oops',
        }),
      ).rejects.toThrow(/escapes the updates directory/);
    });

    it('accepts `..` segments that stay inside (resolve back to a child)', async () => {
      // a/b/../c resolves to a/c — still inside updatesRoot.
      const stashed = await writeStash({
        cfgDir,
        timestamp: 'STAMP',
        relativePath: 'a/b/../c.txt',
        content: 'ok',
      });
      expect(stashed).toBe(path.join(cfgDir, 'updates', 'STAMP', 'a', 'c.txt'));
      expect(fs.readFileSync(stashed, 'utf8')).toBe('ok');
    });
  });
});
