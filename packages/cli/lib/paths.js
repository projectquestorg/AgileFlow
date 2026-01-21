/**
 * AgileFlow CLI - Shared Path Utilities
 *
 * Centralized path resolution functions used across scripts.
 *
 * NOTE: This module delegates to PathResolver for the implementation.
 * Functions accept optional rootDir for backwards compatibility, but
 * if not provided, use PathResolver's manifest-aware auto-detection.
 *
 * For new code, prefer using PathResolver directly:
 *   const { PathResolver, getDefaultResolver } = require('./path-resolver');
 *   const resolver = getDefaultResolver();
 *   const statusPath = resolver.getStatusPath();
 */

const { PathResolver, getDefaultResolver } = require('./path-resolver');
const path = require('path');

// Cache for resolvers by rootDir
const resolverCache = new Map();

/**
 * Get a PathResolver for the given rootDir.
 * Uses singleton for default (no rootDir) case, caches others.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {PathResolver}
 * @private
 */
function getResolver(rootDir) {
  if (!rootDir) {
    return getDefaultResolver();
  }

  // Cache resolvers by rootDir to avoid repeated construction
  if (!resolverCache.has(rootDir)) {
    resolverCache.set(rootDir, new PathResolver(rootDir, { autoDetect: false }));
  }
  return resolverCache.get(rootDir);
}

/**
 * Find the project root by looking for .agileflow directory.
 * Walks up from current directory until .agileflow is found.
 *
 * @param {string} [startDir=process.cwd()] - Directory to start searching from
 * @returns {string} Project root path, or startDir if not found
 */
function getProjectRoot(startDir = process.cwd()) {
  const resolver = new PathResolver(startDir, { autoDetect: true });
  return resolver.getProjectRoot();
}

/**
 * Get the .agileflow directory path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to .agileflow directory
 */
function getAgileflowDir(rootDir) {
  return getResolver(rootDir).getAgileflowDir();
}

/**
 * Get the .claude directory path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to .claude directory
 */
function getClaudeDir(rootDir) {
  return getResolver(rootDir).getClaudeDir();
}

/**
 * Get the docs directory path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to docs directory
 */
function getDocsDir(rootDir) {
  return getResolver(rootDir).getDocsDir();
}

/**
 * Get the status.json path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to status.json
 */
function getStatusPath(rootDir) {
  return getResolver(rootDir).getStatusPath();
}

/**
 * Get the session-state.json path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to session-state.json
 */
function getSessionStatePath(rootDir) {
  return getResolver(rootDir).getSessionStatePath();
}

/**
 * Get the agileflow-metadata.json path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to agileflow-metadata.json
 */
function getMetadataPath(rootDir) {
  return getResolver(rootDir).getMetadataPath();
}

/**
 * Get the message bus log path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to bus/log.jsonl
 */
function getBusLogPath(rootDir) {
  return getResolver(rootDir).getBusLogPath();
}

/**
 * Get the epics directory path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to epics directory
 */
function getEpicsDir(rootDir) {
  return getResolver(rootDir).getEpicsDir();
}

/**
 * Get the stories directory path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to stories directory
 */
function getStoriesDir(rootDir) {
  return getResolver(rootDir).getStoriesDir();
}

/**
 * Get the archive directory path for completed stories.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to archive directory
 */
function getArchiveDir(rootDir) {
  return getResolver(rootDir).getArchiveDir();
}

/**
 * Get the agents directory path (docs/09-agents).
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to agents directory (docs/09-agents)
 */
function getAgentsDir(rootDir) {
  return getResolver(rootDir).getDocsAgentsDir();
}

/**
 * Get the decisions (ADR) directory path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to decisions directory
 */
function getDecisionsDir(rootDir) {
  return getResolver(rootDir).getDecisionsDir();
}

/**
 * Get the research directory path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to research directory
 */
function getResearchDir(rootDir) {
  return getResolver(rootDir).getResearchDir();
}

/**
 * Check if we're in an AgileFlow project.
 * Walks up from dir to find .agileflow directory.
 *
 * @param {string} [dir=process.cwd()] - Directory to check from
 * @returns {boolean} True if .agileflow directory exists in dir or any parent
 */
function isAgileflowProject(dir = process.cwd()) {
  // Use auto-detection to walk up and find project root
  const resolver = new PathResolver(dir, { autoDetect: true });
  return resolver.isAgileflowProject();
}

// ============================================================================
// New functions (added in ConfigResolver consolidation)
// ============================================================================

/**
 * Get the .claude/settings.json path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to settings.json
 */
function getSettingsPath(rootDir) {
  return getResolver(rootDir).getSettingsPath();
}

/**
 * Get the .claude/settings.local.json path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to settings.local.json
 */
function getSettingsLocalPath(rootDir) {
  return getResolver(rootDir).getSettingsLocalPath();
}

/**
 * Get the skills directory path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to skills directory
 */
function getSkillsDir(rootDir) {
  return getResolver(rootDir).getSkillsDir();
}

/**
 * Get the scripts directory path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to scripts directory
 */
function getScriptsDir(rootDir) {
  return getResolver(rootDir).getScriptsDir();
}

/**
 * Get the commands directory path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to commands directory
 */
function getCommandsDir(rootDir) {
  return getResolver(rootDir).getCommandsDir();
}

/**
 * Clear the resolver cache (useful for testing or after config changes).
 */
function clearResolverCache() {
  resolverCache.clear();
}

module.exports = {
  // Root and base directories
  getProjectRoot,
  getAgileflowDir,
  getClaudeDir,
  getDocsDir,

  // Status and session files
  getStatusPath,
  getSessionStatePath,
  getMetadataPath,
  getBusLogPath,

  // Documentation directories
  getEpicsDir,
  getStoriesDir,
  getArchiveDir,
  getAgentsDir,
  getDecisionsDir,
  getResearchDir,

  // Configuration files (new in ConfigResolver consolidation)
  getSettingsPath,
  getSettingsLocalPath,

  // AgileFlow subdirectories (new in ConfigResolver consolidation)
  getSkillsDir,
  getScriptsDir,
  getCommandsDir,

  // Utilities
  isAgileflowProject,
  clearResolverCache,
};
