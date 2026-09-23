import { hashTree, type TreeFile, assertSafeRelativePath } from '@agileflow/core';

/**
 * Registry package format: one JSON document per skill version.
 *
 * JSON keeps the format dependency-free and diffable; integrity is the
 * tree hash of the contained files, so the same content has the same
 * integrity whether it came from the registry, git, or a local path.
 */
export interface SkillBundle {
  format: 'agileflow-skill-bundle';
  formatVersion: 1;
  name: string;
  version: string;
  files: Array<{ path: string; mode: '644' | '755'; content: string }>;
}

export function encodeBundle(name: string, version: string, files: TreeFile[]): string {
  const bundle: SkillBundle = {
    format: 'agileflow-skill-bundle',
    formatVersion: 1,
    name,
    version,
    files: [...files]
      .sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
      .map((f) => ({ path: f.path, mode: f.executable ? '755' : '644', content: f.content.toString('base64') })),
  };
  return JSON.stringify(bundle, null, 2) + '\n';
}

export function decodeBundle(text: string | Buffer): SkillBundle & { tree: TreeFile[] } {
  let raw: SkillBundle;
  try {
    raw = JSON.parse(typeof text === 'string' ? text : text.toString('utf8'));
  } catch (err) {
    throw new Error(`Skill bundle is not valid JSON: ${(err as Error).message}`);
  }
  if (!raw || raw.format !== 'agileflow-skill-bundle' || raw.formatVersion !== 1 || !Array.isArray(raw.files)) {
    throw new Error('Unsupported skill bundle format');
  }
  const seen = new Set<string>();
  const tree: TreeFile[] = raw.files.map((f) => {
    assertSafeRelativePath(f.path);
    if (seen.has(f.path)) throw new Error(`Duplicate path in skill bundle: ${f.path}`);
    seen.add(f.path);
    return { path: f.path, content: Buffer.from(f.content, 'base64'), executable: f.mode === '755' };
  });
  return { ...raw, tree };
}

export class IntegrityError extends Error {
  constructor(what: string, expected: string, actual: string) {
    super(`Integrity mismatch for ${what}: expected ${expected}, got ${actual}`);
    this.name = 'IntegrityError';
  }
}

/** Hash the tree and compare with `expected`; throws IntegrityError on mismatch. */
export function verifyIntegrity(what: string, files: TreeFile[], expected: string | undefined): string {
  const actual = hashTree(files);
  if (expected && actual !== expected) throw new IntegrityError(what, expected, actual);
  return actual;
}
