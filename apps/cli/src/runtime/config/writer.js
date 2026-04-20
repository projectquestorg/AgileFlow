/**
 * Config writer — writes `agileflow.config.json` to a project root.
 *
 * Partner to loader.js. Serializes only the user-facing fields (drops
 * internal metadata like `source`, `path`). Adds `$schema` pointer so
 * editors get completion/validation out of the box.
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
  await fs.promises.writeFile(file, content, 'utf8');
  return file;
}

module.exports = { writeConfig, SCHEMA_REF };
