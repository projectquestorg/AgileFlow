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
  /**
   * Dangling link that is AgileFlow's: it points at the canonical path (the
   * canonical dir is gone), or `stale`: at an old `.agents/skills/<id>` that no
   * longer exists (the project moved; junctions store absolute paths).
   */
  | { state: 'dangling-ours'; stale?: boolean }
  /** Symlink pointing somewhere else. Not ours. */
  | { state: 'foreign-link'; target: string }
  /** Generated mirror; `modified` when someone edited it directly. */
  | { state: 'mirror'; modified: boolean; marker: MirrorMarker }
  /** Real directory without our marker: a user/provider-specific skill. */
  | { state: 'user-dir' }
  | { state: 'file' }
  /**
   * A committed skill link that git checked out as a small text file holding
   * the link target (`core.symlinks=false`, the Git for Windows default).
   */
  | { state: 'git-placeholder'; target: string }
  /** The entry *is* the canonical directory (e.g. `.claude/skills` links to `.agents/skills`). */
  | { state: 'same-as-canonical' };

export interface ClassifyOptions {
  /** Platform whose path rules apply (case-insensitive on win32). Defaults to the running one. */
  platform?: NodeJS.Platform;
}

function samePath(a: string, b: string, platform: NodeJS.Platform): boolean {
  const na = path.resolve(a);
  const nb = path.resolve(b);
  return platform === 'win32' ? na.toLowerCase() === nb.toLowerCase() : na === nb;
}

function errCode(err: unknown): string | undefined {
  return (err as NodeJS.ErrnoException | undefined)?.code;
}

/** realpath, or null when the path (or a link on the way) does not resolve. */
async function realpathOrNull(p: string): Promise<string | null> {
  try {
    return await fs.promises.realpath(p);
  } catch (err) {
    // ELOOP: a link cycle never resolves; treat it like a dangling link.
    if (isNotFound(err) || errCode(err) === 'ELOOP') return null;
    throw err;
  }
}

/**
 * Physical form of a path that may not exist: realpath of its longest
 * existing prefix plus the remaining segments. Relative link targets resolve
 * against the *physical* parent directory, so comparisons must use this.
 */
async function resolveExisting(p: string): Promise<string> {
  const abs = path.resolve(p);
  const rest: string[] = [];
  let cur = abs;
  for (;;) {
    const real = await realpathOrNull(cur);
    if (real) return rest.length ? path.join(real, ...rest) : real;
    const parent = path.dirname(cur);
    if (parent === cur) return abs;
    rest.unshift(path.basename(cur));
    cur = parent;
  }
}

/**
 * True when `target` (a raw link target, absolute or relative, either
 * separator) ends in `.agents/skills/<id>`: the shape of every link AgileFlow
 * creates for skill `<id>`.
 */
function looksLikeCanonicalTarget(target: string, id: string, platform: NodeJS.Platform): boolean {
  const segments = target.split(/[\\/]+/).filter((s) => s && s !== '.');
  const tail = segments.slice(-3);
  const want = ['.agents', 'skills', id];
  if (tail.length !== 3) return false;
  return tail.every((seg, i) => (platform === 'win32' ? seg.toLowerCase() === want[i]!.toLowerCase() : seg === want[i]));
}

/** Largest file that can be a git symlink placeholder worth reading. */
const PLACEHOLDER_MAX_BYTES = 1024;

async function readPlaceholderTarget(entryPath: string, size: number): Promise<string | null> {
  if (size === 0 || size > PLACEHOLDER_MAX_BYTES) return null;
  const text = await fs.promises.readFile(entryPath, 'utf8');
  // git writes the link target verbatim, without a newline.
  if (/[\r\n\0]/.test(text) || path.isAbsolute(text) || /^[a-zA-Z]:/.test(text)) return null;
  return text;
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

/**
 * Classify what currently exists at a provider compatibility path.
 * `canonicalDir` is `<scope>/.agents/skills/<id>`; the entry's basename and
 * the canonical basename are the same skill id.
 */
export async function classifyEntry(
  entryPath: string,
  canonicalDir: string,
  options: ClassifyOptions = {},
): Promise<EntryState> {
  const platform = options.platform ?? process.platform;
  let stat: fs.Stats;
  try {
    stat = await fs.promises.lstat(entryPath);
  } catch (err) {
    if (isNotFound(err)) return { state: 'missing' };
    throw err;
  }
  const canonicalReal = await realpathOrNull(canonicalDir);
  const id = path.basename(canonicalDir);
  if (stat.isSymbolicLink()) {
    const raw = await fs.promises.readlink(entryPath);
    const real = await realpathOrNull(entryPath);
    if (real && canonicalReal && samePath(real, canonicalReal, platform)) {
      // Junctions report as symlinks with absolute targets on Windows.
      return { state: 'linked', linkType: path.isAbsolute(raw) && platform === 'win32' ? 'junction' : 'symlink' };
    }
    if (!real) {
      // Relative targets resolve against the physical parent directory,
      // which differs from the lexical one when .claude (or an ancestor) is a symlink.
      const physical = await resolveExisting(path.resolve(await resolveExisting(path.dirname(entryPath)), raw));
      if (samePath(physical, await resolveExisting(canonicalDir), platform)) return { state: 'dangling-ours' };
      if (samePath(path.resolve(path.dirname(entryPath), raw), canonicalDir, platform)) return { state: 'dangling-ours' };
      // Points at a `.agents/skills/<id>` that no longer exists: a link
      // AgileFlow made before the project (or a symlinked parent) moved.
      if (looksLikeCanonicalTarget(raw, id, platform)) return { state: 'dangling-ours', stale: true };
    }
    return { state: 'foreign-link', target: raw };
  }
  if (stat.isDirectory()) {
    const real = await realpathOrNull(entryPath);
    if (real && canonicalReal && samePath(real, canonicalReal, platform)) return { state: 'same-as-canonical' };
    const marker = await readMirrorMarker(entryPath);
    if (marker) {
      const files = await readTree(entryPath, { exclude: (rel) => rel === MIRROR_MARKER });
      return { state: 'mirror', modified: hashTree(files) !== marker.hash, marker };
    }
    return { state: 'user-dir' };
  }
  if (stat.isFile()) {
    const target = await readPlaceholderTarget(entryPath, stat.size);
    if (target !== null && looksLikeCanonicalTarget(target, id, platform)) return { state: 'git-placeholder', target };
  }
  return { state: 'file' };
}

/**
 * Relative symlink target for `linkPath` -> `target`. The kernel resolves it
 * from the link's *physical* parent, so when `.claude`, `~/.claude`, or the
 * skills dir itself is a symlink, the lexical relative path would dangle.
 * Prefers the plain lexical form (portable in git) whenever it resolves.
 */
export async function relativeLinkTarget(linkPath: string, target: string): Promise<string> {
  const parent = path.dirname(linkPath);
  const parentReal = (await realpathOrNull(parent)) ?? parent;
  const targetReal = await realpathOrNull(target);
  // From the physical parent, `..` steps are physical, so this form is always correct.
  const physical = path.relative(parentReal, target);
  if (!targetReal) return physical;
  for (const rel of [path.relative(parent, target), physical]) {
    if ((await realpathOrNull(path.resolve(parentReal, rel))) === targetReal) return rel;
  }
  return path.relative(parentReal, targetReal);
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
        // Replace a dangling link of ours; never replace anything else
        // (re-checked here: the entry may have changed since planning).
        const existing = await fs.promises.lstat(change.path).catch(() => null);
        if (existing?.isSymbolicLink() && (await realpathOrNull(change.path)) === null) await fs.promises.unlink(change.path);
        let done: LinkMode | null = null;
        let lastError: unknown = null;
        for (const mode of preferredLinkModes(options.env, options.platform)) {
          try {
            if (mode === 'symlink') {
              await fs.promises.symlink(await relativeLinkTarget(change.path, change.target), change.path, 'dir');
            } else if (mode === 'junction') {
              await fs.promises.symlink(path.resolve(change.target), change.path, 'junction');
            } else {
              await writeMirror(change.path, change.target, change.provider, options.root);
            }
            done = mode;
            break;
          } catch (err) {
            lastError = err;
            // Something appeared at the path since planning: never fall back
            // to a mirror, which would replace whatever is there now.
            if (errCode(err) === 'EEXIST') break;
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
