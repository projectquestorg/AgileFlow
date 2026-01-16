/**
 * AgileFlow CLI - Name Validation Utilities
 *
 * Validation patterns for names, IDs, and identifiers.
 * Pre-compiled regex patterns for optimal performance.
 */

/**
 * Pre-compiled validation patterns for common input types.
 * All patterns use strict whitelisting approach.
 * Compiled once at module load for performance.
 */
const PATTERNS = {
  // Git branch: alphanumeric, underscores, hyphens, forward slashes
  // Examples: main, feature/US-0001, session-1, my_branch
  branchName: /^[a-zA-Z0-9][a-zA-Z0-9_/-]*$/,

  // Story ID: US-0001 to US-99999
  storyId: /^US-\d{4,5}$/,

  // Epic ID: EP-0001 to EP-99999
  epicId: /^EP-\d{4,5}$/,

  // Feature name: lowercase with hyphens, starts with letter
  // Examples: damage-control, status-line, archival
  featureName: /^[a-z][a-z0-9-]*$/,

  // Profile name: alphanumeric with underscores/hyphens, starts with letter
  // Examples: default, my-profile, dev_config
  profileName: /^[a-zA-Z][a-zA-Z0-9_-]*$/,

  // Command name: alphanumeric with hyphens/colons, starts with letter
  // Examples: babysit, story:list, agileflow:configure
  commandName: /^[a-zA-Z][a-zA-Z0-9:-]*$/,

  // Session nickname: alphanumeric with hyphens/underscores
  // Examples: auth-work, feature_1, main
  sessionNickname: /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/,

  // Merge strategy: squash or merge
  // Examples: squash, merge
  mergeStrategy: /^(squash|merge)$/,
};

/**
 * Validate a git branch name.
 * @param {string} name - Branch name to validate
 * @returns {boolean} True if valid
 */
function isValidBranchName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length > 255) return false; // Git limit
  if (name.startsWith('-')) return false; // Prevent flag injection
  if (name.includes('..')) return false; // Prevent path traversal
  if (name.endsWith('.lock')) return false; // Reserved
  return PATTERNS.branchName.test(name);
}

/**
 * Validate a story ID (US-XXXX format).
 * @param {string} id - Story ID to validate
 * @returns {boolean} True if valid
 */
function isValidStoryId(id) {
  if (!id || typeof id !== 'string') return false;
  return PATTERNS.storyId.test(id);
}

/**
 * Validate an epic ID (EP-XXXX format).
 * @param {string} id - Epic ID to validate
 * @returns {boolean} True if valid
 */
function isValidEpicId(id) {
  if (!id || typeof id !== 'string') return false;
  return PATTERNS.epicId.test(id);
}

/**
 * Validate a feature name.
 * @param {string} name - Feature name to validate
 * @returns {boolean} True if valid
 */
function isValidFeatureName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length > 50) return false;
  return PATTERNS.featureName.test(name);
}

/**
 * Validate a profile name.
 * @param {string} name - Profile name to validate
 * @returns {boolean} True if valid
 */
function isValidProfileName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length > 50) return false;
  return PATTERNS.profileName.test(name);
}

/**
 * Validate a command name.
 * @param {string} name - Command name to validate
 * @returns {boolean} True if valid
 */
function isValidCommandName(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length > 100) return false;
  return PATTERNS.commandName.test(name);
}

/**
 * Validate a session nickname.
 * @param {string} name - Nickname to validate
 * @returns {boolean} True if valid
 */
function isValidSessionNickname(name) {
  if (!name || typeof name !== 'string') return false;
  if (name.length > 50) return false;
  return PATTERNS.sessionNickname.test(name);
}

/**
 * Validate a merge strategy (squash or merge).
 * @param {string} strategy - Strategy to validate
 * @returns {boolean} True if valid
 */
function isValidMergeStrategy(strategy) {
  if (!strategy || typeof strategy !== 'string') return false;
  return PATTERNS.mergeStrategy.test(strategy);
}

module.exports = {
  PATTERNS,
  isValidBranchName,
  isValidStoryId,
  isValidEpicId,
  isValidFeatureName,
  isValidProfileName,
  isValidCommandName,
  isValidSessionNickname,
  isValidMergeStrategy,
};
