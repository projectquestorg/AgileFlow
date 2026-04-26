/**
 * `agileflow update` — re-run the installer for the currently-enabled
 * plugin set, no prompts.
 *
 * Use cases:
 *   - User edited `agileflow.config.json` directly and wants to apply
 *     it without re-running the wizard.
 *   - CI step that ensures `.agileflow/` is in sync with the committed
 *     `agileflow.config.json`.
 *   - User installed a new bundled plugin via `enable` and wants the
 *     content materialized.
 *
 * Always non-interactive. Exits non-zero on validation / install
 * failure.
 */
const path = require('path');
const pkg = require('../../../package.json');
const { loadConfig } = require('../../runtime/config/loader.js');
const { discoverPlugins } = require('../../runtime/plugins/registry.js');
const { installPlugins } = require('../../runtime/installer/install.js');

/**
 * @param {{ force?: boolean }} options
 */
async function update(options = {}) {
  const cwd = process.cwd();

  let existing;
  try {
    existing = await loadConfig(cwd);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`agileflow update: ${err.message}`);
    process.exit(1);
  }

  if (existing.source === 'defaults') {
    // eslint-disable-next-line no-console
    console.error(
      'agileflow update: no agileflow.config.json found. Run `agileflow setup` first.',
    );
    process.exit(1);
  }

  const enabled = Object.entries(existing.config.plugins || {})
    .filter(([, v]) => v && v.enabled)
    .map(([id]) => id);

  // userSelected excludes core (cannotDisable handles it).
  const userSelected = enabled.filter((id) => id !== 'core');

  let result;
  try {
    result = await installPlugins({
      discovered: discoverPlugins(),
      userSelected,
      agileflowDir: path.join(cwd, '.agileflow'),
      cliVersion: pkg.version,
      force: Boolean(options.force),
    });
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`agileflow update: install failed: ${err.message}`);
    process.exit(1);
  }

  // eslint-disable-next-line no-console
  console.log(`✓ Updated ${enabled.length} plugin(s): ${enabled.join(', ')}`);
  // eslint-disable-next-line no-console
  console.log(
    `  created=${result.ops.created} updated=${result.ops.updated} unchanged=${result.ops.unchanged} preserved=${result.ops.preserved} removed=${result.ops.removed}`,
  );
  if (result.ops.preserved > 0 && result.ops.updatesPath) {
    // eslint-disable-next-line no-console
    console.log(
      `  ${result.ops.preserved} file(s) preserved — review ${result.ops.updatesPath}/`,
    );
  }
}

module.exports = update;
