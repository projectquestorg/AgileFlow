/**
 * Config writer — writes `agileflow.config.json` to a project root atomically.
 *
 * Write strategy: render to a temp file (`.agileflow.config.json.tmp-<pid>`)
 * in the same directory, then `fs.rename()` into place. Same-directory
 * rename is atomic on POSIX and on Windows for files on the same volume,
 * so readers always see either the old content or the new content — never
 * a truncated half-write.
 *
 * Serializes only the user-facing fields (drops internal loader metadata
 * like `source`/`path`). Adds `$schema` pointer for editor validation.
 */
const fs = require('fs');
const path = require('path');

const { CONFIG_FILENAME } = require('./loader.js');

const SCHEMA_REF = './node_modules/agileflow/src/runtime/config/schema.json';

/**
 * @param {string} cwd - project root
 * @param {import('./defaults.js').AgileflowConfig} config
 * @returns {Promise<string>} absolute path of the written config file
 */
async function writeConfig(cwd, config) {
  const file = path.join(cwd, CONFIG_FILENAME);
  const tmp = path.join(cwd, `.${CONFIG_FILENAME}.tmp-${process.pid}`);
  const payload = {
    $schema: SCHEMA_REF,
    version: 1,
    plugins: config.plugins,
    hooks: config.hooks,
    personalization: config.personalization,
    ide: config.ide,
    language: config.language,
  };
  const content = JSON.stringify(payload, null, 2) + '\n';

  try {
    await fs.promises.writeFile(tmp, content, 'utf8');
    await fs.promises.rename(tmp, file);
  } catch (err) {
    // Best-effort cleanup of the temp file on failure. Ignore cleanup errors.
    try {
      await fs.promises.unlink(tmp);
    } catch {
      /* swallow */
    }
    throw err;
  }
  return file;
}

module.exports = { writeConfig, SCHEMA_REF };
