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
 * Covers relative path, executable bit, and content of every file, so it
 * changes when anything a provider could observe changes. Used both as the
 * package `integrity` (tree as published) and the lockfile `renderedHash`
 * (tree as materialized into the project).
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
 * The tree as it should compare across machines: text files with LF line
 * endings and no executable bits. Git's `core.autocrlf` and Windows (which
 * has no executable bit) otherwise make identical skills hash differently.
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
 * Hash recorded as the lockfile `renderedHash`: line-ending and exec-bit
 * insensitive, so a skill checked out on Windows or with autocrlf is still
 * clean. For LF-only trees without executables it equals `hashTree`.
 */
export function renderedHashOf(files: TreeFile[]): string {
  return hashTree(normalizeTree(files));
}

/**
 * True when `files` are what AgileFlow recorded. Accepts the exact hash
 * (locks written before normalization) and the normalized one.
 */
export function matchesRenderedHash(files: TreeFile[], expected: string | undefined): boolean {
  if (!expected) return false;
  return hashTree(files) === expected || renderedHashOf(files) === expected;
}

