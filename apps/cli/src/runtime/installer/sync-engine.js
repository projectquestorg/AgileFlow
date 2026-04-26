/**
 * Sync engine — SHA256-based conflict-aware file installer.
 *
 * Ported from v3 `packages/cli/tools/cli/installers/core/installer.js`
 * lines 349-455 (`copyFileWithPolicy`). Same decision tree, rewritten in
 * plain JS + JSDoc and split into testable pieces.
 *
 * The engine handles one file at a time and returns the action taken.
 * Callers loop over plugin content and aggregate results into
 * `FileOpsCounters`.
 *
 * Decision tree (same as v3):
 *
 *   destExists?
 *     no  → write; record fresh hash; CREATED
 *     yes → force?
 *       yes → overwrite; record fresh hash; UPDATED
 *       no  → compute currentHash of dest
 *              protected flag in index?
 *                yes → currentHash == newHash?
 *                  yes → clear protected; UNCHANGED (auto-converged)
 *                  no  → stash new; keep user file; PRESERVED
 *                no  → index.sha256 == currentHash? (file untouched since last install)
 *                  yes → currentHash != newHash? write new; record hash; UPDATED
 *                        else: nothing to do; UNCHANGED
 *                  no  → (unknown baseline / locally modified)
 *                        currentHash == newHash?
 *                          yes → adopt new hash; UNCHANGED
 *                          no  → stash new; keep user file; PRESERVED
 *
 * The `fileIndex.files[relativePath]` entry is always updated so that
 * the next sync run has an accurate baseline.
 */
const fs = require('fs');
const path = require('path');

const { sha256Hex, sha256File } = require('../../lib/hash.js');
const { writeStash } = require('./stash.js');

/**
 * @typedef {'created' | 'updated' | 'preserved' | 'unchanged'} SyncAction
 *
 * @typedef {Object} FileOpsCounters
 * @property {number} created
 * @property {number} updated
 * @property {number} preserved
 * @property {number} unchanged
 * @property {number} stashed
 * @property {number} removed
 * @property {string|null} updatesPath
 *
 * @typedef {Object} SyncOptions
 * @property {Buffer|string} content - bytes to write at `dest`
 * @property {string} dest - absolute destination path
 * @property {string} relativePath - posix-style path used as the fileIndex key
 * @property {import('./file-index.js').FileIndex} fileIndex - mutated with new hashes
 * @property {string} cfgDir - absolute path to .agileflow/_cfg/
 * @property {string} timestamp - ISO stamp used as the stash bucket
 * @property {boolean} [force=false] - if true, overwrite user modifications
 * @property {FileOpsCounters} [ops] - optional counters; if omitted, caller loses aggregate info
 */

/**
 * @returns {FileOpsCounters}
 */
function emptyCounters() {
  return {
    created: 0,
    updated: 0,
    preserved: 0,
    unchanged: 0,
    stashed: 0,
    removed: 0,
    updatesPath: null,
  };
}

/**
 * Write `content` to `dest` atomically: write a temp file in the same
 * directory, then `rename` it into place. Crashes mid-`writeFile`
 * cannot leave a truncated `dest` — readers always see either the old
 * content or the new content, never a half-write.
 *
 * Temp filename uses pid + random suffix so two concurrent calls in
 * the same process (rare but possible in tests / cluster setups) don't
 * collide on each other's temp file.
 *
 * @param {Buffer|string} content
 * @param {string} dest
 */
async function writeContent(content, dest) {
  await fs.promises.mkdir(path.dirname(dest), { recursive: true });
  const tmp = `${dest}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`;
  try {
    if (typeof content === 'string') {
      await fs.promises.writeFile(tmp, content, 'utf8');
    } else {
      await fs.promises.writeFile(tmp, content);
    }
    await fs.promises.rename(tmp, dest);
  } catch (err) {
    try {
      await fs.promises.unlink(tmp);
    } catch {
      /* swallow */
    }
    throw err;
  }
}

/**
 * Sync a single file. Returns the action taken and mutates `fileIndex`
 * plus `ops` (if provided).
 *
 * @param {SyncOptions} options
 * @returns {Promise<SyncAction>}
 */
async function syncFile(options) {
  const {
    content,
    dest,
    relativePath,
    fileIndex,
    cfgDir,
    timestamp,
    force = false,
    ops,
  } = options;

  const newHash = sha256Hex(content);
  const existing = fileIndex.files[relativePath];
  const existingRecord =
    existing && typeof existing === 'object' && typeof existing.sha256 === 'string'
      ? existing
      : null;

  const currentHash = await sha256File(dest);
  const destExists = currentHash !== null;

  if (!destExists) {
    await writeContent(content, dest);
    fileIndex.files[relativePath] = { sha256: newHash, protected: false };
    if (ops) ops.created++;
    return 'created';
  }

  if (force) {
    await writeContent(content, dest);
    fileIndex.files[relativePath] = { sha256: newHash, protected: false };
    if (ops) ops.updated++;
    return 'updated';
  }

  // Respect a previously-protected file unless it has since converged
  // with upstream (user's edits happen to match the new content — rare
  // but worth auto-clearing the protected flag so future updates flow).
  if (existingRecord && existingRecord.protected) {
    if (currentHash === newHash) {
      fileIndex.files[relativePath] = { sha256: newHash, protected: false };
      if (ops) ops.unchanged++;
      return 'unchanged';
    }
    const stashPath = await writeStash({ cfgDir, timestamp, relativePath, content });
    fileIndex.files[relativePath] = { sha256: currentHash, protected: true };
    if (ops) {
      ops.preserved++;
      ops.stashed++;
      ops.updatesPath = path.dirname(stashPath);
    }
    return 'preserved';
  }

  // Baseline path: user hasn't touched this file since the last install.
  if (existingRecord && existingRecord.sha256 === currentHash) {
    if (currentHash === newHash) {
      // Nothing to do; record stays current.
      fileIndex.files[relativePath] = { sha256: newHash, protected: false };
      if (ops) ops.unchanged++;
      return 'unchanged';
    }
    await writeContent(content, dest);
    fileIndex.files[relativePath] = { sha256: newHash, protected: false };
    if (ops) ops.updated++;
    return 'updated';
  }

  // No baseline OR user-modified file. If the current content happens to
  // match upstream, adopt the hash and move on; otherwise preserve+stash.
  if (currentHash === newHash) {
    fileIndex.files[relativePath] = { sha256: newHash, protected: false };
    if (ops) ops.unchanged++;
    return 'unchanged';
  }

  const stashPath = await writeStash({ cfgDir, timestamp, relativePath, content });
  fileIndex.files[relativePath] = { sha256: currentHash, protected: true };
  if (ops) {
    ops.preserved++;
    ops.stashed++;
    ops.updatesPath = path.dirname(stashPath);
  }
  return 'preserved';
}

module.exports = { syncFile, emptyCounters };
