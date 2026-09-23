import fs from 'node:fs';
import path from 'node:path';
import { hashTree } from './hash';
import { isNotFound, readTree, removePath, replaceDirAtomic, type TreeFile } from './fs';
import type { PlannedChange } from './types';

/** Marker written into generated mirrors so they identify themselves. */
export const MIRROR_MARKER = '.agileflow-mirror.json';

export interface MirrorMarker {
  generatedBy: 'agileflow';
  provider: string;
  /** Canonical directory the mirror was generated from. */
  source: string;
  /** hashTree of the mirror content, excluding this marker. */
  hash: string;
  note: string;
}

export type LinkMode = 'symlink' | 'junction' | 'mirror';

export type EntryState =
  | { state: 'missing' }
  /** Symlink/junction resolving to the expected canonical directory. */
  | { state: 'linked'; linkType: 'symlink' | 'junction' }
  /** Symlink that points at the canonical path but the canonical dir is gone. */
  | { state: 'dangling-ours' }
  /** Symlink pointing somewhere else. Not ours. */
  | { state: 'foreign-link'; target: string }
  /** Generated mirror; `modified` when someone edited it directly. */
  | { state: 'mirror'; modified: boolean; marker: MirrorMarker }
  /** Real directory without our marker: a user/provider-specific skill. */
  | { state: 'user-dir' }
  | { state: 'file' }
  /** The entry *is* the canonical directory (e.g. `.claude/skills` links to `.agents/skills`). */
  | { state: 'same-as-canonical' };

function samePath(a: string, b: string): boolean {
  const na = path.resolve(a);
  const nb = path.resolve(b);
  return process.platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

async function realpathOrNull(p: string): Promise<string | null> {
  try {
    return await fs.promises.realpath(p);
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

export async function readMirrorMarker(dir: string): Promise<MirrorMarker | null> {
  try {
    const raw = JSON.parse(await fs.promises.readFile(path.join(dir, MIRROR_MARKER), 'utf8'));
    if (raw && raw.generatedBy === 'agileflow' && typeof raw.hash === 'string') return raw as MirrorMarker;
    return null;
  } catch {
    return null;
  }
}

/** Classify what currently exists at a provider compatibility path. */
export async function classifyEntry(entryPath: string, canonicalDir: string): Promise<EntryState> {
  let stat: fs.Stats;
  try {
    stat = await fs.promises.lstat(entryPath);
  } catch (err) {
    if (isNotFound(err)) return { state: 'missing' };
    throw err;
  }
  const canonicalReal = await realpathOrNull(canonicalDir);
  if (stat.isSymbolicLink()) {
    const raw = await fs.promises.readlink(entryPath);
    const absTarget = path.resolve(path.dirname(entryPath), raw);
    const real = await realpathOrNull(entryPath);
    if (real && canonicalReal && samePath(real, canonicalReal)) {
      // Junctions report as symlinks with absolute targets on Windows.
      return { state: 'linked', linkType: path.isAbsolute(raw) && process.platform === 'win32' ? 'junction' : 'symlink' };
    }
    if (!real && samePath(absTarget, canonicalDir)) return { state: 'dangling-ours' };
    return { state: 'foreign-link', target: raw };
  }
  if (stat.isDirectory()) {
    const real = await realpathOrNull(entryPath);
    if (real && canonicalReal && samePath(real, canonicalReal)) return { state: 'same-as-canonical' };
    const marker = await readMirrorMarker(entryPath);
    if (marker) {
      const files = await readTree(entryPath, { exclude: (rel) => rel === MIRROR_MARKER });
      return { state: 'mirror', modified: hashTree(files) !== marker.hash, marker };
    }
    return { state: 'user-dir' };
  }
  return { state: 'file' };
}

export function preferredLinkModes(env: Record<string, string | undefined>, platform: NodeJS.Platform): LinkMode[] {
  const forced = env.AGILEFLOW_LINK_MODE as LinkMode | undefined;
  if (forced === 'mirror') return ['mirror'];
  if (forced === 'junction') return ['junction', 'mirror'];
  if (forced === 'symlink') return ['symlink'];
  return platform === 'win32' ? ['symlink', 'junction', 'mirror'] : ['symlink', 'mirror'];
}

async function writeMirror(entryPath: string, canonicalDir: string, provider: string, root: string): Promise<void> {
  const files = await readTree(canonicalDir, { exclude: (rel) => rel === MIRROR_MARKER });
  const marker: MirrorMarker = {
    generatedBy: 'agileflow',
    provider,
    source: path.relative(root, canonicalDir).split(path.sep).join('/'),
    hash: hashTree(files),
    note: 'Generated copy. Edit the canonical skill in the source directory instead; AgileFlow regenerates this mirror.',
  };
  const withMarker: TreeFile[] = [
    ...files,
    { path: MIRROR_MARKER, content: Buffer.from(JSON.stringify(marker, null, 2) + '\n'), executable: false },
  ];
  await replaceDirAtomic(entryPath, withMarker);
}

export interface ApplyResult {
  change: PlannedChange;
  outcome: 'done' | 'skipped' | 'failed';
  linkType?: LinkMode;
  message?: string;
}

/**
 * Apply provider plans. Links fall back symlink -> junction -> mirror.
 * `root` is the scope root, used to record mirror provenance.
 */
export async function applyChanges(
  changes: PlannedChange[],
  options: { root: string; env: Record<string, string | undefined>; platform: NodeJS.Platform; dryRun?: boolean },
): Promise<ApplyResult[]> {
  const results: ApplyResult[] = [];
  for (const change of changes) {
    if (change.kind === 'warn') {
      results.push({ change, outcome: 'skipped', message: change.message });
      continue;
    }
    if (options.dryRun) {
      results.push({ change, outcome: 'done' });
      continue;
    }
    try {
      if (change.kind === 'remove') {
        const stat = await fs.promises.lstat(change.path).catch(() => null);
        if (stat?.isSymbolicLink()) await fs.promises.unlink(change.path);
        else await removePath(change.path);
        results.push({ change, outcome: 'done' });
      } else if (change.kind === 'refresh-mirror') {
        await writeMirror(change.path, change.target, change.provider, options.root);
        results.push({ change, outcome: 'done', linkType: 'mirror' });
      } else {
        await fs.promises.mkdir(path.dirname(change.path), { recursive: true });
        // Replace a dangling link of ours; never replace anything else.
        const existing = await fs.promises.lstat(change.path).catch(() => null);
        if (existing?.isSymbolicLink()) await fs.promises.unlink(change.path);
        let done: LinkMode | null = null;
        let lastError: unknown = null;
        for (const mode of preferredLinkModes(options.env, options.platform)) {
          try {
            if (mode === 'symlink') {
              const rel = path.relative(path.dirname(change.path), change.target);
              await fs.promises.symlink(rel, change.path, 'dir');
            } else if (mode === 'junction') {
              await fs.promises.symlink(path.resolve(change.target), change.path, 'junction');
            } else {
              await writeMirror(change.path, change.target, change.provider, options.root);
            }
            done = mode;
            break;
          } catch (err) {
            lastError = err;
          }
        }
        if (!done) throw lastError ?? new Error('could not create link');
        results.push({ change, outcome: 'done', linkType: done });
      }
    } catch (err) {
      results.push({ change, outcome: 'failed', message: (err as Error).message });
    }
  }
  return results;
}
