/**
 * Plugin picker — Clack multiselect driven by the plugin registry.
 *
 * Shows required plugins (core) as informational, then asks the user to
 * multiselect opt-ins. Matches the skills.sh/vercel-labs UX.
 *
 * Cancellation (Ctrl+C or Esc) calls prompts.cancel and exits cleanly.
 */
const prompts = require('@clack/prompts');
const { discoverPlugins } = require('../../runtime/plugins/registry.js');

/**
 * @param {import('../../runtime/config/defaults.js').AgileflowConfig} currentConfig
 * @returns {Promise<Record<string, { enabled: boolean }>>}
 */
async function pickPlugins(currentConfig) {
  const all = discoverPlugins();
  const required = all.filter((p) => p.cannotDisable);
  const optional = all.filter((p) => !p.cannotDisable);

  if (required.length) {
    prompts.log.info(
      `Always on: ${required.map((p) => `${p.name} (${p.id})`).join(', ')}`,
    );
  }

  const initialValues = optional
    .filter((p) => {
      const existing = (currentConfig.plugins || {})[p.id];
      if (existing && typeof existing.enabled === 'boolean') return existing.enabled;
      return p.enabledByDefault;
    })
    .map((p) => p.id);

  const picked = await prompts.multiselect({
    message: 'Select optional plugins to enable:',
    options: optional.map((p) => ({
      value: p.id,
      label: p.name,
      hint: p.description,
    })),
    initialValues,
    required: false,
  });

  if (prompts.isCancel(picked)) {
    prompts.cancel('Setup cancelled.');
    process.exit(0);
  }

  const enabled = new Set([
    ...required.map((p) => p.id),
    ...(/** @type {string[]} */ (picked)),
  ]);

  /** @type {Record<string, { enabled: boolean }>} */
  const result = {};
  for (const p of all) {
    result[p.id] = { enabled: enabled.has(p.id) };
  }
  return result;
}

module.exports = { pickPlugins };
