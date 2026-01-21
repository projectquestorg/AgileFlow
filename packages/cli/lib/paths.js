/**
 * AgileFlow CLI - Shared Path Utilities
 *
 * Centralized path resolution functions used across scripts.
 */

const fs = require('fs');
const path = require('path');

/**
 * Find the project root by looking for .agileflow directory.
 * Walks up from current directory until .agileflow is found.
 *
 * @param {string} [startDir=process.cwd()] - Directory to start searching from
 * @returns {string} Project root path, or startDir if not found
 */
function getProjectRoot(startDir = process.cwd()) {
  let dir = startDir;
  while (!fs.existsSync(path.join(dir, '.agileflow')) && dir !== '/') {
    dir = path.dirname(dir);
  }
  return dir !== '/' ? dir : startDir;
}

/**
 * Get the .agileflow directory path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to .agileflow directory
 */
function getAgileflowDir(rootDir) {
  const root = rootDir || getProjectRoot();
  return path.join(root, '.agileflow');
}

/**
 * Get the .claude directory path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to .claude directory
 */
function getClaudeDir(rootDir) {
  const root = rootDir || getProjectRoot();
  return path.join(root, '.claude');
}

/**
 * Get the docs directory path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to docs directory
 */
function getDocsDir(rootDir) {
  const root = rootDir || getProjectRoot();
  return path.join(root, 'docs');
}

/**
 * Get the status.json path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to status.json
 */
function getStatusPath(rootDir) {
  const root = rootDir || getProjectRoot();
  return path.join(root, 'docs', '09-agents', 'status.json');
}

/**
 * Get the session-state.json path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to session-state.json
 */
function getSessionStatePath(rootDir) {
  const root = rootDir || getProjectRoot();
  return path.join(root, 'docs', '09-agents', 'session-state.json');
}

/**
 * Get the agileflow-metadata.json path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to agileflow-metadata.json
 */
function getMetadataPath(rootDir) {
  const root = rootDir || getProjectRoot();
  return path.join(root, 'docs', '00-meta', 'agileflow-metadata.json');
}

/**
 * Get the message bus log path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to bus/log.jsonl
 */
function getBusLogPath(rootDir) {
  const root = rootDir || getProjectRoot();
  return path.join(root, 'docs', '09-agents', 'bus', 'log.jsonl');
}

/**
 * Get the epics directory path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to epics directory
 */
function getEpicsDir(rootDir) {
  const root = rootDir || getProjectRoot();
  return path.join(root, 'docs', '05-epics');
}

/**
 * Get the stories directory path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to stories directory
 */
function getStoriesDir(rootDir) {
  const root = rootDir || getProjectRoot();
  return path.join(root, 'docs', '06-stories');
}

/**
 * Get the archive directory path for completed stories.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to archive directory
 */
function getArchiveDir(rootDir) {
  const root = rootDir || getProjectRoot();
  return path.join(root, 'docs', '09-agents', 'archive');
}

/**
 * Get the agents directory path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to agents directory (docs/09-agents)
 */
function getAgentsDir(rootDir) {
  const root = rootDir || getProjectRoot();
  return path.join(root, 'docs', '09-agents');
}

/**
 * Get the decisions (ADR) directory path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to decisions directory
 */
function getDecisionsDir(rootDir) {
  const root = rootDir || getProjectRoot();
  return path.join(root, 'docs', '03-decisions');
}

/**
 * Get the research directory path.
 *
 * @param {string} [rootDir] - Project root (auto-detected if not provided)
 * @returns {string} Path to research directory
 */
function getResearchDir(rootDir) {
  const root = rootDir || getProjectRoot();
  return path.join(root, 'docs', '10-research');
}

/**
 * Check if we're in an AgileFlow project.
 *
 * @param {string} [dir=process.cwd()] - Directory to check
 * @returns {boolean} True if .agileflow directory exists
 */
function isAgileflowProject(dir = process.cwd()) {
  const root = getProjectRoot(dir);
  return fs.existsSync(path.join(root, '.agileflow'));
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

  // Utilities
  isAgileflowProject,
};
