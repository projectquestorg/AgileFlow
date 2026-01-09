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
  getProjectRoot,
  getAgileflowDir,
  getClaudeDir,
  getDocsDir,
  getStatusPath,
  getSessionStatePath,
  isAgileflowProject,
};
