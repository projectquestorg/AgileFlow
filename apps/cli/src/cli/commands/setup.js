/**
 * `agileflow setup` — interactive install wizard.
 *
 * Phase 2a: real wizard that writes agileflow.config.json.
 *   - Plugin multiselect via @clack/prompts (skills.sh-style UX)
 *   - Personalization prompts (tone, ask_level, verbosity)
 *   - Non-interactive path: --yes --plugins <ids>
 *
 * Does NOT perform installation yet (sync engine lands in Phase 2b). A
 * successful `setup` leaves the project with a valid config file; running
 * `agileflow update` later will materialize `.claude/*` content.
 */
const prompts = require('@clack/prompts');
const pkg = require('../../../package.json');
const { loadConfig } = require('../../runtime/config/loader.js');
const { writeConfig } = require('../../runtime/config/writer.js');
const { defaultConfig } = require('../../runtime/config/defaults.js');
const { discoverPlugins } = require('../../runtime/plugins/registry.js');
const { pickPlugins } = require('../wizard/plugin-picker.js');
const { personalizationPrompts } = require('../wizard/personalization.js');

/**
 * Build a plugins map from a comma-separated list, enforcing that any
 * cannotDisable plugin (core) is always enabled.
 * @param {string} csv
 * @returns {Record<string, { enabled: boolean }>}
 */
function pluginsFromCsv(csv) {
  const requested = new Set(
    (csv || '').split(',').map((s) => s.trim()).filter(Boolean),
  );
  const all = discoverPlugins();
  /** @type {Record<string, { enabled: boolean }>} */
  const result = {};
  for (const p of all) {
    result[p.id] = { enabled: p.cannotDisable || requested.has(p.id) };
  }
  return result;
}

/**
 * @param {{ yes?: boolean, plugins?: string }} options
 */
async function setup(options = {}) {
  const cwd = process.cwd();
  const existing = await loadConfig(cwd);
  const base = existing.source === 'file' ? existing.config : defaultConfig();

  if (options.yes) {
    const plugins = pluginsFromCsv(options.plugins || 'core');
    const next = {
      ...base,
      plugins,
    };
    const file = await writeConfig(cwd, next);
    const enabled = Object.entries(plugins)
      .filter(([, v]) => v.enabled)
      .map(([id]) => id);
    // eslint-disable-next-line no-console
    console.log(`agileflow setup --yes: wrote ${file}`);
    // eslint-disable-next-line no-console
    console.log(`  plugins enabled: ${enabled.join(', ')}`);
    return;
  }

  prompts.intro(`agileflow v${pkg.version} setup`);

  if (existing.source === 'file') {
    prompts.log.info(`Existing config found at ${existing.path} — re-running wizard to update.`);
  } else {
    prompts.log.info('No existing config — starting from defaults.');
  }

  const plugins = await pickPlugins(base);
  const personalization = await personalizationPrompts(base.personalization);

  /** @type {import('../../runtime/config/defaults.js').AgileflowConfig} */
  const next = {
    ...base,
    plugins,
    personalization,
  };

  const spinner = prompts.spinner();
  spinner.start('Writing agileflow.config.json');
  const file = await writeConfig(cwd, next);
  spinner.stop(`Config written → ${file}`);

  const enabledList = Object.entries(plugins)
    .filter(([, v]) => v.enabled)
    .map(([id]) => id);

  prompts.outro(
    [
      `${enabledList.length} plugins enabled: ${enabledList.join(', ')}`,
      '',
      'Next: Phase 2b will land the installer and materialize .claude/* content.',
    ].join('\n'),
  );
}

module.exports = setup;
