import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  canonicalContent,
  clearPlatformCache,
  hashTree,
  HASH_VERSION,
  LockfileSchema,
  matchesRenderedHash,
  normalizeTree,
  parseCoreFileMode,
  readLockfile,
  renderedRecordOf,
  serializeLockfile,
  tracksExecBits,
  type LockEntry,
  type TreeFile,
} from '@agileflow/core';

const tmp: string[] = [];
function tmpdir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'af-platform-'));
  tmp.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
  clearPlatformCache();
});

const file = (p: string, content: string, executable = false): TreeFile => ({ path: p, content: Buffer.from(content), executable });
const SKILL = '---\nname: demo\ndescription: Demo skill. Use when testing.\n---\n\nBody.\nMore.\n';
const rendered = [file('SKILL.md', SKILL), file('scripts/run.sh', '#!/bin/sh\necho hi\n', true)];

describe('installed-file comparison rule (hash version 2)', () => {
  const record = renderedRecordOf(rendered);

  it('records the content hash, the rule version, and the executable files', () => {
    expect(record).toEqual({ renderedHash: expect.stringMatching(/^sha256-/), hashVersion: HASH_VERSION, executables: ['scripts/run.sh'] });
    // For trees whose files are uniformly LF or CRLF the content hash equals the legacy
    // normalized hash, so CLIs that predate hash versions still read these entries as clean.
    expect(record.renderedHash).toBe(hashTree(normalizeTree(rendered)));
  });

  it('accepts a whole-file line-ending conversion (Git autocrlf) and nothing partial', () => {
    const crlf = rendered.map((f) => ({ ...f, content: Buffer.from(f.content.toString().replace(/\n/g, '\r\n')) }));
    expect(matchesRenderedHash(crlf, record, { execBits: true })).toBe(true);
    // CRLF introduced on one line of an LF file is an edit, not a checkout.
    const partial = [file('SKILL.md', SKILL.replace('Body.\n', 'Body.\r\n')), rendered[1]!];
    expect(matchesRenderedHash(partial, record)).toBe(false);
    // The legacy rule (no hashVersion) cannot see that; it is kept only for old entries.
    expect(matchesRenderedHash(partial, { renderedHash: hashTree(normalizeTree(rendered)) })).toBe(true);
    expect(matchesRenderedHash([file('SKILL.md', `${SKILL}edit\n`), rendered[1]!], record)).toBe(false);
  });

  it('never rewrites binary content and leaves lone CRs alone', () => {
    expect(canonicalContent(Buffer.from([0, 13, 10]))).toEqual(Buffer.from([0, 13, 10]));
    expect(canonicalContent(Buffer.from('a\rb\r\n'))).toEqual(Buffer.from('a\rb\n'));
    expect(canonicalContent(Buffer.from('a\r\nb\n'))).toEqual(Buffer.from('a\r\nb\n'));
    expect(canonicalContent(Buffer.from('no newline\r'))).toEqual(Buffer.from('no newline\r'));
  });

  it('compares executable bits only where they are kept', () => {
    const chmodded = [{ ...rendered[0]!, executable: true }, rendered[1]!];
    const lostX = [rendered[0]!, { ...rendered[1]!, executable: false }];
    expect(matchesRenderedHash(chmodded, record, { execBits: true })).toBe(false);
    expect(matchesRenderedHash(lostX, record, { execBits: true })).toBe(false);
    // Windows and core.fileMode=false: bits carry no information.
    expect(matchesRenderedHash(chmodded, record, { execBits: false })).toBe(true);
    expect(matchesRenderedHash(lostX, record)).toBe(true);
  });

  it('keeps legacy entries working and refuses rules from a newer CLI', () => {
    expect(matchesRenderedHash(rendered, hashTree(rendered))).toBe(true);
    expect(matchesRenderedHash(rendered, { renderedHash: hashTree(normalizeTree(rendered)) })).toBe(true);
    expect(matchesRenderedHash(rendered, { ...record, hashVersion: HASH_VERSION + 1 })).toBe(false);
    expect(matchesRenderedHash(rendered, undefined)).toBe(false);
  });
});

describe('executable bits per platform', () => {
  it('reads core.fileMode with Git boolean rules', () => {
    expect(parseCoreFileMode('[core]\n\tfilemode = false\n')).toBe(false);
    expect(parseCoreFileMode('[Core]\n\tfileMode = no\n')).toBe(false);
    expect(parseCoreFileMode('[core]\n\tfilemode\n')).toBe(true);
    expect(parseCoreFileMode('[core]\n\tfilemode =\n')).toBe(false);
    expect(parseCoreFileMode('[core]\n\tfilemode = "false" ; comment\n')).toBe(false);
    expect(parseCoreFileMode('[core "sub"]\n\tfilemode = false\n')).toBe(null);
    expect(parseCoreFileMode('[user]\n\tfilemode = false\n[core]\n\tbare = false\n')).toBe(null);
    expect(parseCoreFileMode('[core] filemode = false\n[core]\n\tfilemode = true\n')).toBe(true);
  });

  it('ignores bits on Windows and in repositories with core.fileMode=false', async () => {
    const root = tmpdir();
    expect(await tracksExecBits(root, 'win32')).toBe(false);
    expect(await tracksExecBits(root, 'linux')).toBe(true); // no repository
    fs.mkdirSync(path.join(root, '.git'));
    fs.writeFileSync(path.join(root, '.git', 'config'), '[core]\n\trepositoryformatversion = 0\n\tfilemode = false\n');
    const nested = path.join(root, 'packages', 'x');
    fs.mkdirSync(nested, { recursive: true });
    clearPlatformCache();
    expect(await tracksExecBits(nested, 'linux')).toBe(false);
    fs.writeFileSync(path.join(root, '.git', 'config'), '[core]\n\tfilemode = true\n');
    clearPlatformCache();
    expect(await tracksExecBits(root, 'darwin')).toBe(true);
  });

  it('follows a linked worktree to the shared config', async () => {
    const main = tmpdir();
    fs.mkdirSync(path.join(main, '.git', 'worktrees', 'wt'), { recursive: true });
    fs.writeFileSync(path.join(main, '.git', 'config'), '[core]\n\tfilemode = false\n');
    fs.writeFileSync(path.join(main, '.git', 'worktrees', 'wt', 'commondir'), '../..\n');
    const wt = tmpdir();
    fs.writeFileSync(path.join(wt, '.git'), `gitdir: ${path.join(main, '.git', 'worktrees', 'wt')}\n`);
    expect(await tracksExecBits(wt, 'linux')).toBe(false);
  });
});

describe('lockfile format gating', () => {
  const legacy: LockEntry = {
    source: '@agileflow/demo',
    version: '1.0.0',
    integrity: hashTree(rendered),
    path: '.agents/skills/demo',
    renderedHash: hashTree(normalizeTree(rendered)),
    activation: 'auto',
    ownership: 'managed',
  };

  it('writes format 2 only when an entry uses the new fields', () => {
    expect(serializeLockfile({ version: 1, resolved: { demo: legacy } })).toMatch(/^version: 1$/m);
    const text = serializeLockfile({
      version: 1,
      resolved: { demo: { ...legacy, ...renderedRecordOf(rendered), renderer: 1, questionOverlay: 'prefer' } },
    });
    expect(text).toMatch(/^version: 2$/m);
    expect(text).toContain('    hashVersion: 2\n    executables:\n      - scripts/run.sh\n    renderer: 1\n    questionOverlay: prefer\n    activation: auto\n');
  });

  it('refuses newer formats and hash rules with an upgrade message, and keeps informational fields', async () => {
    const dir = tmpdir();
    const lockPath = path.join(dir, 'agileflow.lock');
    fs.writeFileSync(lockPath, serializeLockfile({ version: 1, resolved: { demo: { ...legacy, ...renderedRecordOf(rendered), renderer: 1 } } }));
    expect((await readLockfile(lockPath))!.resolved.demo!.hashVersion).toBe(2);
    fs.writeFileSync(lockPath, 'version: 3\nresolved: {}\n');
    await expect(readLockfile(lockPath)).rejects.toThrow(/format version 3, written by a newer AgileFlow\. Upgrade the CLI/);
    const future = { version: 2, resolved: { demo: { ...legacy, hashVersion: HASH_VERSION + 1 } } };
    const parsed = LockfileSchema.safeParse(future);
    expect(parsed.success).toBe(false);
    expect(JSON.stringify(parsed.error?.issues)).toContain('newer installed-file hash rule');
    // A newer renderer is not refused: sync leaves such skills as committed.
    expect(LockfileSchema.safeParse({ version: 2, resolved: { demo: { ...legacy, renderer: 99, note: 'x' } } }).success).toBe(true);
  });

  it('still reads the committed format-1 lock of this repository', async () => {
    const lock = await readLockfile(path.resolve(__dirname, '../../../agileflow.lock'));
    expect(lock?.version).toBe(1);
    expect(Object.values(lock!.resolved).every((e) => e.hashVersion === undefined && e.renderer === undefined)).toBe(true);
  });
});
