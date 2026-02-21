/**
 * AgileFlow CLI - Feature Flags
 *
 * Centralized feature flag detection for experimental and optional features.
 * Reads from environment variables and agileflow-metadata.json.
 *
 * Usage:
 *   const { isAgentTeamsEnabled, getFeatureFlags } = require('../lib/feature-flags');
 *   if (isAgentTeamsEnabled()) { ... }
 */

const fs = require('fs');

/**
 * Tools expected to be available when Agent Teams native mode is enabled.
 * Used for feature detection and capability reporting.
 */
const AGENT_TEAMS_TOOLS = Object.freeze(['TeamCreate', 'SendMessage', 'ListTeams']);

// Lazy-load paths to avoid circular dependency issues
let _paths;
function getPaths() {
  if (!_paths) {
    _paths = require('./paths');
  }
  return _paths;
}

/**
 * Check if Claude Code's native Agent Teams feature is enabled.
 *
 * Detection order:
 *   1. CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS env var (truthy = enabled)
 *   2. agileflow-metadata.json features.agentTeams.enabled
 *
 * @param {object} [options] - Options
 * @param {string} [options.rootDir] - Project root directory
 * @param {object} [options.metadata] - Pre-loaded metadata (avoids file read)
 * @returns {boolean} True if Agent Teams is enabled
 */
function isAgentTeamsEnabled(options = {}) {
  // 1. Environment variable takes priority (Claude Code sets this)
  const envVar = process.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS;
  if (envVar !== undefined) {
    return envVar === '1' || envVar === 'true' || envVar === 'yes';
  }

  // 2. Check agileflow-metadata.json
  try {
    const metadata = options.metadata || loadMetadata(options.rootDir);
    if (metadata?.features?.agentTeams?.enabled === true) {
      return true;
    }
  } catch (e) {
    // Silently fail - feature not enabled
  }

  return false;
}

/**
 * Get the current Agent Teams mode.
 *
 * @param {object} [options] - Options
 * @param {string} [options.rootDir] - Project root directory
 * @param {object} [options.metadata] - Pre-loaded metadata
 * @returns {'native'|'subagent'|'disabled'} Current mode
 */
function getAgentTeamsMode(options = {}) {
  if (!isAgentTeamsEnabled(options)) {
    return 'subagent'; // Fallback to existing Task/TaskOutput subagent system
  }
  return 'native';
}

/**
 * Get the list of Agent Teams tools available in the current environment.
 *
 * When Agent Teams is enabled (native mode), returns the expected tool names.
 * When disabled, returns an empty array.
 *
 * @param {object} [options] - Options
 * @param {string} [options.rootDir] - Project root directory
 * @param {object} [options.metadata] - Pre-loaded metadata
 * @returns {string[]} Array of available tool names
 */
function getAvailableTools(options = {}) {
  if (!isAgentTeamsEnabled(options)) {
    return [];
  }
  return [...AGENT_TEAMS_TOOLS];
}

/**
 * Get all feature flags as an object.
 *
 * @param {object} [options] - Options
 * @param {string} [options.rootDir] - Project root directory
 * @param {object} [options.metadata] - Pre-loaded metadata
 * @returns {object} Feature flags
 */
function getFeatureFlags(options = {}) {
  const metadata = options.metadata || loadMetadataSafe(options.rootDir);
  const opts = { ...options, metadata };

  return {
    agentTeams: isAgentTeamsEnabled(opts),
    agentTeamsMode: getAgentTeamsMode(opts),
    availableTools: getAvailableTools(opts),
  };
}

/**
 * Format feature flags for display (used by welcome script).
 *
 * @param {object} [options] - Options
 * @param {string} [options.rootDir] - Project root directory
 * @returns {object} Display info { label, value, color }
 */
function getAgentTeamsDisplayInfo(options = {}) {
  const enabled = isAgentTeamsEnabled(options);

  if (enabled) {
    const tools = getAvailableTools(options);
    return {
      label: 'Agent Teams',
      value: `ENABLED (native, ${tools.length} tools)`,
      status: 'enabled',
    };
  }

  return {
    label: 'Agent Teams',
    value: 'subagent mode',
    status: 'fallback',
  };
}

/**
 * Load metadata from agileflow-metadata.json.
 * @private
 */
function loadMetadata(rootDir) {
  const paths = getPaths();
  const metadataPath = paths.getMetadataPath(rootDir);
  if (fs.existsSync(metadataPath)) {
    return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  }
  return null;
}

/**
 * Load metadata safely (never throws).
 * @private
 */
function loadMetadataSafe(rootDir) {
  try {
    return loadMetadata(rootDir);
  } catch (e) {
    return null;
  }
}

module.exports = {
  AGENT_TEAMS_TOOLS,
  isAgentTeamsEnabled,
  getAgentTeamsMode,
  getAvailableTools,
  getFeatureFlags,
  getAgentTeamsDisplayInfo,
};
