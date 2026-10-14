import crypto from 'node:crypto';
import type { TreeFile } from './fs';

export function sha256Hex(content: Buffer | string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

/** Subresource-Integrity style digest: `sha256-<base64>`. */
export function sri(content: Buffer | string): string {
  return `sha256-${crypto.createHash('sha256').update(content).digest('base64')}`;
}

/**
 * Deterministic hash of a file tree.
 *
 * Covers relative path, executable bit, and exact content of every file, so
 * it changes when anything a provider could observe changes. This is the
 * package `integrity` (tree as published), which is always exact. Installed
 * directories are compared with `matchesRenderedHash` instead.
 */
export function hashTree(files: TreeFile[]): string {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const lines = sorted.map(
    (f) => `${f.path}\n${f.executable ? 'x' : '-'}\n${sha256Hex(f.content)}\n`,
  );
  return sri(lines.join(''));
}

/** A file whose content has no NUL byte is treated as text for line-ending normalization. */
function isText(content: Buffer): boolean {
  return !content.includes(0);
}

/**
 * Legacy (hash version 1) normalization: every CRLF becomes LF in text files
 * and executable bits are dropped. Kept for lock entries written before
 * `hashVersion` existed; it also hides a partial CRLF edit and a chmod.
 */
export function normalizeTree(files: TreeFile[]): TreeFile[] {
  return files.map((f) => ({
    path: f.path,
    executable: false,
    content: isText(f.content) && f.content.includes(0x0d)
      ? Buffer.from(f.content.toString('utf8').replace(/\r\n/g, '\n'), 'utf8')
      : f.content,
  }));
}

/**
 * Installed-file comparison rule written by this CLI (`hashVersion` in the
 * lock and in mirror markers). Readers accept every version up to this one.
 *
 * Version 2:
 * - Line endings: the only permitted difference is a whole-file conversion,
 *   which is what Git does (`core.autocrlf`, `eol`). A text file whose every
 *   LF is preceded by CR compares as its LF form; any other file, including
 *   one that mixes CRLF and LF lines, compares byte for byte. So a checkout
 *   with CRLF is clean, while an edit that introduced CRLF on some lines of an
 *   LF file is a modification. (A package that itself mixes line endings can
 *   therefore read as modified after Git normalizes it: the safe direction.)
 * - Executable bits are recorded separately (`executables`), so the content
 *   hash is the same on every platform and the bits are compared only where
 *   the filesystem keeps them (see `execBits`).
 */
export const HASH_VERSION = 2;

/** LF form of a text file that uses CRLF throughout; anything else unchanged. */
export function canonicalContent(content: Buffer): Buffer {
  if (!isText(content) || !content.includes(0x0d)) return content;
  let lf = 0;
  for (let i = content.indexOf(0x0a); i !== -1; i = content.indexOf(0x0a, i + 1)) {
    if (i === 0 || content[i - 1] !== 0x0d) return content;
    lf++;
  }
  if (!lf) return content;
  return Buffer.from(content.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
}

/** Content hash under the current rule: canonical line endings, no executable bits. */
export function renderedHashOf(files: TreeFile[]): string {
  return hashTree(files.map((f) => ({ path: f.path, executable: false, content: canonicalContent(f.content) })));
}

/** Sorted paths of executable files; recorded next to `renderedHash`. */
export function executablePaths(files: TreeFile[]): string[] {
  return files
    .filter((f) => f.executable)
    .map((f) => f.path)
    .sort();
}

/** What AgileFlow recorded about an installed tree (a lock entry or a mirror marker). */
export interface RenderedRecord {
  renderedHash?: string;
  /** Absent: legacy entry (hash version 1 or exact). */
  hashVersion?: number;
  /** Version 2: paths that were written executable (absent means none). */
  executables?: string[];
}

export interface MatchOptions {
  /**
   * Compare executable bits (version 2 records only). Off on Windows and in
   * repositories with `core.fileMode=false`, where the bits say nothing about
   * the file (see `tracksExecBits`). Default: off, the lenient choice.
   */
  execBits?: boolean;
}

/**
 * True when `files` are what AgileFlow recorded. A plain string (or a record
 * without `hashVersion`) is a legacy hash: the exact tree hash or the version
 * 1 normalized one both match, as before. A record from a newer rule than
 * this CLI knows never matches, so nothing is overwritten on a guess.
 */
export function matchesRenderedHash(
  files: TreeFile[],
  expected: string | RenderedRecord | undefined,
  options: MatchOptions = {},
): boolean {
  const record: RenderedRecord = typeof expected === 'string' ? { renderedHash: expected } : (expected ?? {});
  const hash = record.renderedHash;
  if (!hash) return false;
  if (record.hashVersion === undefined) return hashTree(files) === hash || hashTree(normalizeTree(files)) === hash;
  if (record.hashVersion !== HASH_VERSION) return false;
  if (renderedHashOf(files) !== hash) return false;
  if (!options.execBits) return true;
  const want = [...(record.executables ?? [])].sort();
  const have = executablePaths(files);
  return want.length === have.length && want.every((p, i) => p === have[i]);
}

/** The record this CLI writes for `files`: content hash, rule version, executable paths. */
export function renderedRecordOf(files: TreeFile[]): Required<Pick<RenderedRecord, 'renderedHash' | 'hashVersion'>> &
  Pick<RenderedRecord, 'executables'> {
  const executables = executablePaths(files);
  return { renderedHash: renderedHashOf(files), hashVersion: HASH_VERSION, ...(executables.length ? { executables } : {}) };
}
