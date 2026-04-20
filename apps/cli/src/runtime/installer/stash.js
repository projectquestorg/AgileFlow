/**
 * Stash writer for the sync engine.
 *
 * When the sync engine encounters a user-modified destination file whose
 * content diverges from the incoming upstream version, it preserves the
 * user's file in place and writes the new version to a stash directory
 * at `<cfgDir>/updates/<timestamp>/<relativePath>` so the user can
 * manually diff and merge.
 */
const fs = require('fs');
const path = require('path');

/**
 * @param {Object} args
 * @param {string} args.cfgDir - absolute path to .agileflow/_cfg/
 * @param {string} args.timestamp - stable stamp for this sync run
 * @param {string} args.relativePath - posix-style path (no leading slash)
 * @param {Buffer|string} args.content - bytes to stash (as would have been written)
 * @returns {Promise<string>} absolute path the stash file was written to
 */
async function writeStash({ cfgDir, timestamp, relativePath, content }) {
  const updatesRoot = path.join(cfgDir, 'updates', timestamp);
  const stashPath = path.join(updatesRoot, relativePath);
  await fs.promises.mkdir(path.dirname(stashPath), { recursive: true });
  if (typeof content === 'string') {
    await fs.promises.writeFile(stashPath, content, 'utf8');
  } else {
    await fs.promises.writeFile(stashPath, content);
  }
  return stashPath;
}

module.exports = { writeStash };
