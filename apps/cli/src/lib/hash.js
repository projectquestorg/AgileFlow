/**
 * SHA256 helpers.
 *
 * `sha256Hex` accepts either a Buffer or a string. Strings are encoded as
 * UTF-8 for hashing so the output is deterministic regardless of whether
 * the caller holds a pre-rendered text string or the raw file bytes.
 */
const crypto = require('crypto');
const fs = require('fs');

/**
 * @param {Buffer|string} content
 * @returns {string} lowercase hex digest
 * @throws {TypeError} if content is null or undefined
 */
function sha256Hex(content) {
  if (content == null) {
    throw new TypeError(
      `sha256Hex: content must be Buffer or string, got ${content === null ? 'null' : 'undefined'}`,
    );
  }
  const buf = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
  return crypto.createHash('sha256').update(buf).digest('hex');
}

/**
 * Hash a file on disk. Returns null if the file does not exist.
 * @param {string} filePath
 * @returns {Promise<string|null>}
 */
async function sha256File(filePath) {
  try {
    const data = await fs.promises.readFile(filePath);
    return sha256Hex(data);
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

module.exports = { sha256Hex, sha256File };
