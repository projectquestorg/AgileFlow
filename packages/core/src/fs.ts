import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** One file inside a skill tree. `path` is POSIX-relative to the tree root. */
export interface TreeFile {
  path: string;
  content: Buffer;
  /** True when the file carries an executable bit. */
  executable: boolean;
}

/** Names never considered part of a skill tree. */
const IGNORED_NAMES = new Set(['.git', '.DS_Store', 'Thumbs.db', 'node_modules']);
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
/** Operating-system litter that is safe to discard with a skill directory. */
const OS_LITTER = new Set(['.DS_Store', 'Thumbs.db']);

export function toPosix(p: string): string {
  return p.split(path.sep).join('/');
}

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.promises.lstat(p);
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

export function isNotFound(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException | null)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}

export async function readTextIfExists(p: string): Promise<string | null> {
  try {
    return await fs.promises.readFile(p, 'utf8');
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

function tmpName(target: string, tag: string): string {
  return path.join(
    path.dirname(target),
    `.${path.basename(target)}.agileflow-${tag}-${process.pid}-${crypto.randomBytes(4).toString('hex')}`,
  );
}

const RETRYABLE_RENAME = new Set(['EPERM', 'EBUSY', 'EACCES']);

/**
 * `rename` with short retries for Windows, where antivirus scanners and
 * indexers briefly hold handles (EPERM/EBUSY). Elsewhere it fails fast.
 */
export async function renameWithRetry(from: string, to: string, attempts = 6): Promise<void> {
  for (let i = 0; ; i++) {
    try {
      await fs.promises.rename(from, to);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code ?? '';
      if (process.platform !== 'win32' || !RETRYABLE_RENAME.has(code) || i >= attempts - 1) throw err;
      await new Promise((resolve) => setTimeout(resolve, 20 * 2 ** i));
    }
  }
}

/**
 * Write a file atomically (temp file + rename). Creates parent directories.
 *
 * An existing target keeps what the user arranged: a symlink is written
 * through (its target is replaced, the link stays), and the file mode is
 * preserved (a 0600 config stays 0600).
 */
export async function writeFileAtomic(target: string, content: string | Buffer): Promise<void> {
  let real = target;
  let mode: number | undefined;
  try {
    real = await fs.promises.realpath(target);
    mode = (await fs.promises.stat(real)).mode & 0o7777;
  } catch (err) {
    if (!isNotFound(err)) throw err;
    // A dangling symlink: write to where it points so the link stays intact.
    try {
      const link = await fs.promises.readlink(target);
      real = path.resolve(path.dirname(target), link);
    } catch {
      real = target;
    }
  }
  await fs.promises.mkdir(path.dirname(real), { recursive: true });
  const tmp = tmpName(real, 'tmp');
  try {
    await fs.promises.writeFile(tmp, content, mode === undefined ? undefined : { mode });
    if (mode !== undefined) await fs.promises.chmod(tmp, mode);
    await renameWithRetry(tmp, real);
  } catch (err) {
    await fs.promises.rm(tmp, { force: true });
    throw err;
  }
}

/**
 * Read every regular file under `dir` (following no symlinks inside the
 * tree). Returns files sorted by path. Throws ENOENT when `dir` is missing.
 */
export async function readTree(
  dir: string,
  options: { exclude?: (relPath: string) => boolean } = {},
): Promise<TreeFile[]> {
  const out: TreeFile[] = [];
  async function walk(abs: string, rel: string): Promise<void> {
    const entries = await fs.promises.readdir(abs, { withFileTypes: true });
    for (const entry of entries) {
      // Control characters in a name would make tree hashes ambiguous; such
      // entries are never part of a package (listUnhashedEntries reports them).
      if (IGNORED_NAMES.has(entry.name) || CONTROL_CHARS.test(entry.name)) continue;
      const childAbs = path.join(abs, entry.name);
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (options.exclude?.(childRel)) continue;
      if (entry.isDirectory()) {
        await walk(childAbs, childRel);
      } else if (entry.isFile()) {
        const [content, stat] = await Promise.all([
          fs.promises.readFile(childAbs),
          fs.promises.stat(childAbs),
        ]);
        out.push({ path: childRel, content, executable: (stat.mode & 0o111) !== 0 });
      }
      // Symlinks and special files inside skill trees are ignored on purpose:
      // packages must be self-contained regular files.
    }
  }
  await walk(dir, '');
  out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return out;
}

/**
 * Entries inside `dir` that `readTree` does not hash: symlinks, special
 * files, nested `.git`/`node_modules`, and empty directories. They are
 * invisible to ownership hashes, so a directory containing any is treated
 * as user-modified rather than silently deleted on replacement.
 */
export async function listUnhashedEntries(dir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(abs: string, rel: string): Promise<number> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(abs, { withFileTypes: true });
    } catch (err) {
      if (isNotFound(err)) return 0;
      throw err;
    }
    let kept = 0;
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (OS_LITTER.has(entry.name)) continue;
      kept++;
      if (IGNORED_NAMES.has(entry.name) || CONTROL_CHARS.test(entry.name)) out.push(JSON.stringify(childRel).slice(1, -1));
      else if (entry.isDirectory()) {
        if ((await walk(path.join(abs, entry.name), childRel)) === 0) out.push(`${childRel}/`);
      } else if (!entry.isFile()) out.push(childRel);
    }
    return kept;
  }
  await walk(dir, '');
  return out.sort();
}

/** Reject paths that would escape the tree root. */
export function assertSafeRelativePath(rel: string): void {
  // Control characters would make tree hashes ambiguous; `:` is an NTFS
  // alternate data stream on Windows. Skills never need either.
  if (!rel || /[\u0000-\u001f\u007f:]/.test(rel)) {
    throw new Error(`Invalid path in skill package: ${JSON.stringify(rel)}`);
  }
  const normalized = path.posix.normalize(rel);
  if (
    normalized.startsWith('../') ||
    normalized === '..' ||
    path.posix.isAbsolute(normalized) ||
    /^[a-zA-Z]:/.test(normalized) ||
    normalized.includes('\\')
  ) {
    throw new Error(`Unsafe path in skill package: ${rel}`);
  }
}

/** Write a tree into an empty/nonexistent directory. */
export async function writeTree(dir: string, files: TreeFile[]): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true });
  for (const file of files) {
    assertSafeRelativePath(file.path);
    const dest = path.join(dir, ...file.path.split('/'));
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.writeFile(dest, file.content);
    if (file.executable) await fs.promises.chmod(dest, 0o755);
  }
}

/**
 * Replace `target` with a directory containing exactly `files`.
 *
 * The new tree is written next to the target first, then swapped in with
 * renames so a crash never leaves a half-written skill in place.
 */
export async function replaceDirAtomic(target: string, files: TreeFile[]): Promise<void> {
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  const staging = tmpName(target, 'new');
  await writeTree(staging, files);
  const backup = tmpName(target, 'old');
  let movedOld = false;
  try {
    if (await pathExists(target)) {
      await renameWithRetry(target, backup);
      movedOld = true;
    }
    await renameWithRetry(staging, target);
  } catch (err) {
    if (movedOld && !(await pathExists(target))) {
      await fs.promises.rename(backup, target).catch(() => undefined);
    }
    await fs.promises.rm(staging, { recursive: true, force: true });
    throw err;
  }
  if (movedOld) await fs.promises.rm(backup, { recursive: true, force: true });
}

export async function removePath(p: string): Promise<void> {
  await fs.promises.rm(p, { recursive: true, force: true });
}

/** Remove `dir` and empty parents up to (not including) `stopAt`. */
export async function pruneEmptyDirs(dir: string, stopAt: string): Promise<void> {
  let current = path.resolve(dir);
  const stop = path.resolve(stopAt);
  while (current.startsWith(stop + path.sep)) {
    try {
      const entries = await fs.promises.readdir(current);
      if (entries.length > 0) return;
      await fs.promises.rmdir(current);
    } catch (err) {
      if (isNotFound(err)) {
        // already gone; keep walking up
      } else {
        return;
      }
    }
    current = path.dirname(current);
  }
}

/** Copy a directory tree (regular files only). */
export async function copyTree(src: string, dest: string): Promise<void> {
  await writeTree(dest, await readTree(src));
}
