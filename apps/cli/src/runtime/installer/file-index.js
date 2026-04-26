/**
 * File index read/write for the sync engine.
 *
 * The file index (`_cfg/files.json`) records the SHA256 hash of every
 * file the installer has written into the user's project and whether
 * the user has since diverged from that baseline. The sync engine uses
 * the index to decide whether a destination file is safe to overwrite,
 * should be preserved, or should trigger a stash.
 *
 * Schema (version 1):
 *   {
 *     schema: 1,
 *     generated_at: <ISO string>,
 *     version: <CLI version that wrote this index>,
 *     files: {
 *       "<posix-relative-path>": {
 *         sha256: "<hex>",
 *         protected: <bool>
 *       },
 *       ...
 *     }
 *   }
 */
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;

/**
 * @typedef {{ sha256: string, protected: boolean }} FileRecord
 * @typedef {{ schema: 1, generated_at: string, version: string, files: Record<string, FileRecord> }} FileIndex
 */

/**
 * Build an empty index. Caller fills `files` as sync proceeds.
 * @param {string} cliVersion
 * @returns {FileIndex}
 */
function emptyIndex(cliVersion) {
  return {
    schema: SCHEMA_VERSION,
    generated_at: new Date().toISOString(),
    version: cliVersion,
    files: {},
  };
}

/**
 * Read an index file. Returns null on missing file, malformed JSON, or
 * schema mismatch — the caller should treat any of those as "first
 * install / no baseline" and start fresh.
 *
 * @param {string} indexPath
 * @returns {Promise<FileIndex|null>}
 */
async function readFileIndex(indexPath) {
  let raw;
  try {
    raw = await fs.promises.readFile(indexPath, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  if (parsed.schema !== SCHEMA_VERSION) return null;
  if (!parsed.files || typeof parsed.files !== 'object' || Array.isArray(parsed.files)) {
    return null;
  }
  return /** @type {FileIndex} */ (parsed);
}

/**
 * Write the index atomically (temp + rename), matching the writer's
 * pattern for the user config. Callers should pass the final index they
 * produced — nothing about `files` is validated here.
 *
 * @param {string} indexPath
 * @param {FileIndex} index
 * @returns {Promise<void>}
 */
async function writeFileIndex(indexPath, index) {
  const dir = path.dirname(indexPath);
  await fs.promises.mkdir(dir, { recursive: true });
  const tmp = path.join(
    dir,
    `${path.basename(indexPath)}.tmp-${process.pid}-${Math.random().toString(36).slice(2, 10)}`,
  );
  const payload = {
    ...index,
    generated_at: new Date().toISOString(),
  };
  const content = JSON.stringify(payload, null, 2) + '\n';
  try {
    await fs.promises.writeFile(tmp, content, 'utf8');
    await fs.promises.rename(tmp, indexPath);
  } catch (err) {
    try {
      await fs.promises.unlink(tmp);
    } catch {
      /* swallow */
    }
    throw err;
  }
}

module.exports = { SCHEMA_VERSION, emptyIndex, readFileIndex, writeFileIndex };
