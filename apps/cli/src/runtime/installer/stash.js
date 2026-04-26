/**
 * Stash writer for the sync engine.
 *
 * When the sync engine encounters a user-modified destination file whose
 * content diverges from the incoming upstream version, it preserves the
 * user's file in place and writes the new version to a stash directory
 * at `<cfgDir>/updates/<timestamp>/<relativePath>` so the user can
 * manually diff and merge.
 *
 * Path-traversal-safe: a malicious or buggy `relativePath` containing
 * `..` segments cannot escape the updates directory. The resolved
 * destination is checked against the resolved updates root and rejected
 * if it points outside.
 */
const fs = require('fs');
const path = require('path');

/**
 * @param {Object} args
 * @param {string} args.cfgDir - absolute path to .agileflow/_cfg/
 * @param {string} args.timestamp - stable stamp for this sync run
 * @param {string} args.relativePath - posix-style path (no leading slash, no `..`)
 * @param {Buffer|string} args.content - bytes to stash (as would have been written)
 * @returns {Promise<string>} absolute path the stash file was written to
 */
async function writeStash({ cfgDir, timestamp, relativePath, content }) {
  // Reject absolute paths up front. `path.join` would otherwise treat
  // `/etc/passwd` as a relative segment, silently producing
  // `<updatesRoot>/etc/passwd` which is technically inside the root
  // but not what the caller intended.
  if (path.isAbsolute(relativePath)) {
    throw new Error(
      `writeStash: relativePath "${relativePath}" escapes the updates directory (must be a relative path)`,
    );
  }

  const updatesRoot = path.resolve(path.join(cfgDir, 'updates', timestamp));
  const stashPath = path.resolve(path.join(updatesRoot, relativePath));

  // Path-traversal guard: stashPath must be at or under updatesRoot.
  // We check both equality (a relativePath that resolves to the dir
  // itself) and the path.sep prefix (any descendant).
  if (
    stashPath !== updatesRoot &&
    !stashPath.startsWith(updatesRoot + path.sep)
  ) {
    throw new Error(
      `writeStash: relativePath "${relativePath}" escapes the updates directory`,
    );
  }

  await fs.promises.mkdir(path.dirname(stashPath), { recursive: true });
  if (typeof content === 'string') {
    await fs.promises.writeFile(stashPath, content, 'utf8');
  } else {
    await fs.promises.writeFile(stashPath, content);
  }
  return stashPath;
}

module.exports = { writeStash };
