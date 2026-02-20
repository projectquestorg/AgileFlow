/**
 * IDE Capability Profile Loader
 *
 * Loads YAML capability profiles with validation and caching.
 * Used by installers, generators, and feature-detection code.
 *
 * Usage:
 *   const loader = require('./profiles/loader');
 *   const profile = loader.load('claude-code');
 *   if (profile.capabilities.core.planMode) { ... }
 */

const yaml = require('js-yaml');
const fs = require('fs');
const path = require('path');

const PROFILES_DIR = __dirname;
const CACHE = {};

/**
 * Load a profile by IDE name
 * @param {string} ideId - IDE identifier (claude-code, cursor, windsurf, codex)
 * @returns {Object} Profile object
 * @throws {Error} If profile not found or invalid YAML
 */
function load(ideId) {
  if (CACHE[ideId]) {
    return CACHE[ideId];
  }

  const filePath = path.join(PROFILES_DIR, `${ideId}.yaml`);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Profile not found: ${ideId}`);
  }

  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const profile = yaml.load(content);

    // Validate profile structure
    validateProfile(profile, ideId);

    CACHE[ideId] = profile;
    return profile;
  } catch (e) {
    if (e instanceof yaml.YAMLException) {
      throw new Error(`Invalid YAML in profile ${ideId}: ${e.message}`);
    }
    throw e;
  }
}

/**
 * Load all available profiles
 * @returns {Object} Map of IDE ID to profile
 */
function loadAll() {
  const profiles = {};
  const files = fs.readdirSync(PROFILES_DIR)
    .filter(f => f.endsWith('.yaml'));

  files.forEach(file => {
    const ideId = file.replace('.yaml', '');
    try {
      profiles[ideId] = load(ideId);
    } catch (e) {
      console.error(`Failed to load profile ${ideId}: ${e.message}`);
    }
  });

  return profiles;
}

/**
 * Get list of available profiles
 * @returns {Array<string>} List of IDE IDs
 */
function listAvailable() {
  return fs.readdirSync(PROFILES_DIR)
    .filter(f => f.endsWith('.yaml'))
    .map(f => f.replace('.yaml', ''))
    .sort();
}

/**
 * Check if IDE is supported
 * @param {string} ideId - IDE identifier
 * @returns {boolean} True if IDE profile exists
 */
function isSupported(ideId) {
  return fs.existsSync(path.join(PROFILES_DIR, `${ideId}.yaml`));
}

/**
 * Validate profile structure
 * @private
 * @param {Object} profile - Profile object
 * @param {string} ideId - IDE identifier
 * @throws {Error} If validation fails
 */
function validateProfile(profile, ideId) {
  const required = ['ide', 'paths', 'capabilities', 'toolNames'];

  for (const field of required) {
    if (!profile[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }

  // Validate ide object
  if (!profile.ide.id || !profile.ide.name) {
    throw new Error('ide object must have id and name fields');
  }

  // Validate capabilities structure
  const validCapGroups = ['core', 'planning', 'lifecycle', 'external', 'collaboration'];
  for (const group of Object.keys(profile.capabilities)) {
    if (!validCapGroups.includes(group)) {
      console.warn(`Unknown capability group in ${ideId}: ${group}`);
    }
  }
}

/**
 * Get capability status for an IDE
 * @param {string} ideId - IDE identifier
 * @param {string} group - Capability group (core, planning, lifecycle, external, collaboration)
 * @param {string} capability - Capability name
 * @returns {boolean|null} True if supported, false if not, null if unknown
 */
function hasCapability(ideId, group, capability) {
  const profile = load(ideId);
  const groupCapabilities = profile.capabilities[group];

  if (!groupCapabilities) {
    return null;
  }

  return groupCapabilities[capability] === true;
}

/**
 * Get tool name for an IDE
 * Returns the tool name used by the IDE, or null if not supported
 *
 * @param {string} ideId - IDE identifier
 * @param {string} toolAlias - Standard tool alias (askUser, bash, read, etc.)
 * @returns {string|null} IDE-specific tool name or null
 */
function getToolName(ideId, toolAlias) {
  const profile = load(ideId);
  return profile.toolNames[toolAlias] || null;
}

/**
 * Get all capabilities for an IDE (flattened)
 * @param {string} ideId - IDE identifier
 * @returns {Object} Map of capability name to boolean
 */
function getAllCapabilities(ideId) {
  const profile = load(ideId);
  const capabilities = {};

  for (const [group, groupCaps] of Object.entries(profile.capabilities)) {
    if (typeof groupCaps === 'object' && !Array.isArray(groupCaps)) {
      for (const [cap, value] of Object.entries(groupCaps)) {
        if (typeof value === 'boolean') {
          capabilities[`${group}.${cap}`] = value;
        }
      }
    }
  }

  return capabilities;
}

/**
 * Find all IDEs supporting a capability
 * @param {string} group - Capability group
 * @param {string} capability - Capability name
 * @returns {Array<string>} List of IDE IDs that support this capability
 */
function findIDEsWithCapability(group, capability) {
  const ides = [];
  const all = loadAll();

  for (const [ideId, profile] of Object.entries(all)) {
    if (profile.capabilities[group] && profile.capabilities[group][capability] === true) {
      ides.push(ideId);
    }
  }

  return ides.sort();
}

/**
 * Get comparison table for a specific capability across all IDEs
 * @param {string} group - Capability group
 * @param {string} capability - Capability name
 * @returns {Object} Map of IDE ID to boolean
 */
function compareCapability(group, capability) {
  const result = {};
  const all = loadAll();

  for (const [ideId, profile] of Object.entries(all)) {
    result[ideId] = profile.capabilities[group] && profile.capabilities[group][capability] === true;
  }

  return result;
}

/**
 * Clear profile cache
 * Useful for testing or reloading profiles after updates
 */
function clearCache() {
  for (const key of Object.keys(CACHE)) {
    delete CACHE[key];
  }
}

module.exports = {
  load,
  loadAll,
  listAvailable,
  isSupported,
  hasCapability,
  getToolName,
  getAllCapabilities,
  findIDEsWithCapability,
  compareCapability,
  clearCache,
};
