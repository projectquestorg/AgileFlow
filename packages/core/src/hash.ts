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
 * package `integrity` (tree as published) and the lockfile `baseHash`
 * (tree as materialized into the project).
 */
export function hashTree(files: TreeFile[]): string {
  const sorted = [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const lines = sorted.map(
    (f) => `${f.path}\n${f.executable ? 'x' : '-'}\n${sha256Hex(f.content)}\n`,
  );
  return sri(lines.join(''));
}

export function isIntegrity(value: unknown): value is string {
  return typeof value === 'string' && /^sha256-[A-Za-z0-9+/]+=*$/.test(value);
}
