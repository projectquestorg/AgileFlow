/**
 * `agileflow status` — print install state, enabled plugins, hook health.
 *
 * Phase 1 stub: prints version + config summary if present. Hook health,
 * plugin state beyond `enabled` flag, and integrity counts land in Phase 5.
 */
const path = require('path');
const pkg = require('../../../package.json');
const { loadConfig } = require('../../runtime/config/loader.js');

/** @param {{ json?: boolean }} options */
async function status(options = {}) {
  const cwd = process.cwd();
  const result = await loadConfig(cwd);

  const summary = {
    version: pkg.version,
    cwd,
    configPath: result.path || null,
    configSource: result.source, // 'file' | 'defaults'
    plugins: Object.entries(result.config.plugins || {})
      .filter(([, v]) => v && v.enabled)
      .map(([id]) => id),
    personalization: result.config.personalization,
    phase: 'Phase 1 skeleton — installer/hooks/content pending',
  };

  if (options.json) {
    // eslint-disable-next-line no-console
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const lines = [
    `agileflow v${summary.version}`,
    `cwd:      ${summary.cwd}`,
    `config:   ${summary.configPath ? path.relative(cwd, summary.configPath) : '(defaults — no agileflow.config.json found)'}`,
    `plugins:  ${summary.plugins.length ? summary.plugins.join(', ') : '(none enabled — core is default)'}`,
    `tone:     ${summary.personalization.tone}`,
    `ask:      ${summary.personalization.ask_level}`,
    `phase:    ${summary.phase}`,
  ];
  // eslint-disable-next-line no-console
  console.log(lines.join('\n'));
}

module.exports = status;
