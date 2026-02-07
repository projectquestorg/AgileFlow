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
 * Get all feature flags as an object.
 *
 * @param {object} [options] - Options
 * @param {string} [options.rootDir] - Project root directory
 * @param {object} [options.metadata] - Pre-loaded metadata
 * @returns {object} Feature flags
 */
function getFeatureFlags(options = {}) {
  const metadata = options.metadata || loadMetadataSafe(options.rootDir);

  return {
    agentTeams: isAgentTeamsEnabled({ ...options, metadata }),
    agentTeamsMode: getAgentTeamsMode({ ...options, metadata }),
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
  const mode = getAgentTeamsMode(options);

  if (enabled) {
    return {
      label: 'Agent Teams',
      value: 'ENABLED (native)',
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
  isAgentTeamsEnabled,
  getAgentTeamsMode,
  getFeatureFlags,
  getAgentTeamsDisplayInfo,
};
