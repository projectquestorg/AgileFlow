/**
 * Plugin picker — Clack multiselect driven by the plugin registry.
 *
 * Exports a pure `buildPluginsMap()` helper used by both the interactive
 * wizard and the non-interactive `--yes` path. The helper:
 *   - forces cannotDisable plugins (core) to enabled
 *   - marks the user-picked opt-ins as enabled
 *   - marks the rest of discovered opt-ins as disabled
 *   - PRESERVES any custom (non-discovered) plugin entries from the
 *     existing config, so wizard reruns don't silently drop user edits
 *
 * Cancellation (Ctrl+C / Esc) exits with code 1 (not 0) so CI can tell
 * the difference between success and user abort.
 */
const prompts = require('@clack/prompts');
const { discoverPlugins } = require('../../runtime/plugins/registry.js');

/**
 * @param {Array<{id:string, cannotDisable?:boolean}>} discovered
 * @param {Set<string>} selectedOptionalIds
 * @param {Record<string, {enabled:boolean, settings?:any}>} [existingPluginsMap]
 * @returns {Record<string, { enabled: boolean, settings?: any }>}
 */
function buildPluginsMap(discovered, selectedOptionalIds, existingPluginsMap = {}) {
  /** @type {Record<string, { enabled: boolean, settings?: any }>} */
  const result = {};
  for (const p of discovered) {
    /** @type {{ enabled: boolean, settings?: any }} */
    const entry = {
      enabled: Boolean(p.cannotDisable) || selectedOptionalIds.has(p.id),
    };
    // Preserve `settings` sub-object across wizard reruns: enable/disable
    // is recomputed each time from the user's picker choices, but any
    // per-plugin settings (e.g. seo.settings.crawlDepth) are keyed by
    // plugin id and should survive untouched.
    const existing = (existingPluginsMap || {})[p.id];
    if (
      existing &&
      typeof existing === 'object' &&
      !Array.isArray(existing) &&
      existing.settings
    ) {
      entry.settings = existing.settings;
    }
    result[p.id] = entry;
  }
  // Preserve unknown (custom / user-added) plugin entries from existing config.
  // Arrays are rejected — they pass `typeof === 'object'` but would break any
  // downstream code that reads `entry.enabled` as a property.
  for (const [id, entry] of Object.entries(existingPluginsMap || {})) {
    if (
      !(id in result) &&
      entry &&
      typeof entry === 'object' &&
      !Array.isArray(entry)
    ) {
      result[id] = entry;
    }
  }
  return result;
}

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
      return Boolean(p.enabledByDefault);
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
    prompts.cancel('Setup cancelled. No changes made.');
    process.exit(1);
  }

  const selectedOptionalIds = new Set(/** @type {string[]} */ (picked));
  return buildPluginsMap(all, selectedOptionalIds, currentConfig.plugins || {});
}

module.exports = { pickPlugins, buildPluginsMap };
