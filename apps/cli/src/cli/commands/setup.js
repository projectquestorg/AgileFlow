/**
 * `agileflow setup` — interactive install wizard.
 *
 * Phase 2a (hardened): real wizard that writes agileflow.config.json.
 *   - Plugin multiselect via @clack/prompts (skills.sh-style UX)
 *   - Personalization prompts (tone, ask_level, verbosity)
 *   - Non-interactive path: --yes --plugins <ids>
 *   - Error handling: write failures, plugin discovery failures, and
 *     unknown plugin ids all produce actionable user messages.
 *   - Custom (non-discovered) plugin entries in the existing config are
 *     preserved across wizard reruns — we only rewrite the bundled-plugin
 *     section of the plugins map.
 *
 * Does NOT perform installation yet (sync engine lands in Phase 2b).
 */
const prompts = require('@clack/prompts');
const pkg = require('../../../package.json');
const { loadConfig } = require('../../runtime/config/loader.js');
const { writeConfig } = require('../../runtime/config/writer.js');
const { defaultConfig } = require('../../runtime/config/defaults.js');
const { discoverPlugins } = require('../../runtime/plugins/registry.js');
const { pickPlugins, buildPluginsMap } = require('../wizard/plugin-picker.js');
const { personalizationPrompts } = require('../wizard/personalization.js');

/**
 * Parse a CSV of plugin ids, apply it over the discovered+existing plugin
 * set, and surface any ids that don't map to a known plugin.
 *
 * @param {string} csv
 * @param {Record<string, { enabled: boolean, settings?: any }>} existingPlugins
 * @returns {{ plugins: Record<string, { enabled: boolean }>, unknownPlugins: string[] }}
 */
function pluginsFromCsv(csv, existingPlugins = {}) {
  const requested = new Set(
    (csv || '').split(',').map((s) => s.trim()).filter(Boolean),
  );
  const discovered = discoverPlugins();
  const discoveredIds = new Set(discovered.map((p) => p.id));
  const unknownPlugins = [...requested].filter((id) => !discoveredIds.has(id));

  const selectedDiscoveredIds = new Set(
    [...requested].filter((id) => discoveredIds.has(id)),
  );
  const plugins = buildPluginsMap(
    discovered,
    selectedDiscoveredIds,
    existingPlugins,
  );

  return { plugins, unknownPlugins };
}

/**
 * Write the config and surface failures as actionable messages, not stack
 * traces. Shared between the interactive and --yes paths so both get the
 * same UX.
 *
 * @param {string} cwd
 * @param {import('../../runtime/config/defaults.js').AgileflowConfig} config
 * @param {{ interactive: boolean, spinner?: any }} ctx
 */
async function writeConfigWithFeedback(cwd, config, ctx) {
  try {
    return await writeConfig(cwd, config);
  } catch (err) {
    if (ctx.interactive) {
      if (ctx.spinner) ctx.spinner.stop('Config write failed');
      prompts.log.error(`Could not write config: ${err.message}`);
      prompts.log.info('Check permissions and disk space, then run `agileflow setup` again.');
    } else {
      // eslint-disable-next-line no-console
      console.error(`agileflow setup: failed to write config: ${err.message}`);
      // eslint-disable-next-line no-console
      console.error('Check permissions and disk space, then retry.');
    }
    process.exit(1);
  }
}

/**
 * @param {{ yes?: boolean, plugins?: string }} options
 */
async function setup(options = {}) {
  const cwd = process.cwd();

  /** @type {Awaited<ReturnType<typeof loadConfig>>} */
  let existing;
  try {
    existing = await loadConfig(cwd);
  } catch (err) {
    if (options.yes) {
      // eslint-disable-next-line no-console
      console.error(`agileflow setup: ${err.message}`);
      process.exit(1);
    }
    prompts.intro(`agileflow v${pkg.version} setup`);
    prompts.log.error(err.message);
    prompts.log.info('Fix or delete agileflow.config.json and re-run `agileflow setup`.');
    process.exit(1);
  }

  const base = existing.source === 'file' ? existing.config : defaultConfig();

  if (options.yes) {
    const { plugins, unknownPlugins } = pluginsFromCsv(
      options.plugins || 'core',
      base.plugins,
    );
    if (unknownPlugins.length) {
      const known = discoverPlugins().map((p) => p.id).join(', ');
      // eslint-disable-next-line no-console
      console.error(`agileflow setup: unknown plugin(s): ${unknownPlugins.join(', ')}`);
      // eslint-disable-next-line no-console
      console.error(`Available plugins: ${known}`);
      process.exit(1);
    }

    const next = { ...base, plugins };
    const file = await writeConfigWithFeedback(cwd, next, { interactive: false });
    const enabled = Object.entries(plugins)
      .filter(([, v]) => v && v.enabled)
      .map(([id]) => id);
    // eslint-disable-next-line no-console
    console.log(`✓ Wrote ${file}`);
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

  let plugins;
  try {
    plugins = await pickPlugins(base);
  } catch (err) {
    prompts.log.error(`Failed to load plugins: ${err.message}`);
    prompts.cancel('Setup cannot continue. Fix plugin manifests and retry.');
    process.exit(1);
  }
  const personalization = await personalizationPrompts(base.personalization);

  /** @type {import('../../runtime/config/defaults.js').AgileflowConfig} */
  const next = {
    ...base,
    plugins,
    personalization,
  };

  const spinner = prompts.spinner();
  spinner.start('Writing agileflow.config.json');
  const file = await writeConfigWithFeedback(cwd, next, {
    interactive: true,
    spinner,
  });
  spinner.stop(`Config written → ${file}`);

  const enabledList = Object.entries(plugins)
    .filter(([, v]) => v && v.enabled)
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
module.exports.pluginsFromCsv = pluginsFromCsv;
