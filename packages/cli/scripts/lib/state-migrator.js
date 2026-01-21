/**
 * AgileFlow CLI - State Schema Migrator
 *
 * Handles schema versioning and automatic migrations for status.json.
 * Ensures backwards compatibility as the schema evolves.
 *
 * Schema Version History:
 * - 1.0.0: Original schema (no version field)
 * - 2.0.0: Added schema_version field, normalized story structure
 */

const fs = require('fs');
const path = require('path');

// Import status constants from single source of truth
const { VALID_STATUSES } = require('./story-state-machine');

// Current schema version
const CURRENT_SCHEMA_VERSION = '2.0.0';

// Migration log
let migrationLog = [];

/**
 * Parse semantic version string into components
 * @param {string} version - Version string (e.g., "1.2.3")
 * @returns {{ major: number, minor: number, patch: number }}
 */
function parseVersion(version) {
  if (!version || version === 'unknown') {
    return { major: 1, minor: 0, patch: 0 };
  }
  const parts = version.split('.').map(Number);
  return {
    major: parts[0] !== undefined && !isNaN(parts[0]) ? parts[0] : 1,
    minor: parts[1] !== undefined && !isNaN(parts[1]) ? parts[1] : 0,
    patch: parts[2] !== undefined && !isNaN(parts[2]) ? parts[2] : 0,
  };
}

/**
 * Compare two version strings
 * @param {string} v1 - First version
 * @param {string} v2 - Second version
 * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1, v2) {
  const p1 = parseVersion(v1);
  const p2 = parseVersion(v2);

  if (p1.major !== p2.major) return p1.major < p2.major ? -1 : 1;
  if (p1.minor !== p2.minor) return p1.minor < p2.minor ? -1 : 1;
  if (p1.patch !== p2.patch) return p1.patch < p2.patch ? -1 : 1;
  return 0;
}

/**
 * Detect the schema version of a status.json object
 * @param {Object} data - Parsed status.json data
 * @returns {string} Detected schema version
 */
function detectSchemaVersion(data) {
  // Explicit version field
  if (data.schema_version) {
    return data.schema_version;
  }

  // No version field = v1.0.0 (original schema)
  return '1.0.0';
}

/**
 * Log a migration action
 * @param {string} message - Migration log message
 */
function logMigration(message) {
  const entry = {
    timestamp: new Date().toISOString(),
    message,
  };
  migrationLog.push(entry);
}

/**
 * Clear migration log
 */
function clearMigrationLog() {
  migrationLog = [];
}

/**
 * Get migration log
 * @returns {Array} Migration log entries
 */
function getMigrationLog() {
  return [...migrationLog];
}

/**
 * Migration: 1.0.0 -> 2.0.0
 * - Adds schema_version field
 * - Normalizes story status values
 * - Adds migrated_at timestamp
 *
 * @param {Object} data - Status data at v1.0.0
 * @returns {Object} Migrated data at v2.0.0
 */
function migrate_1_0_0_to_2_0_0(data) {
  logMigration('Starting migration from 1.0.0 to 2.0.0');

  const migrated = {
    schema_version: '2.0.0',
    ...data,
  };

  // Normalize story status values
  const statusNormalization = {
    todo: 'ready',
    new: 'ready',
    pending: 'ready',
    open: 'ready',
    wip: 'in_progress',
    working: 'in_progress',
    in_review: 'in_progress',
    closed: 'completed',
    done: 'completed',
    finished: 'completed',
    resolved: 'completed',
  };

  let normalizedCount = 0;
  if (migrated.stories) {
    for (const [storyId, story] of Object.entries(migrated.stories)) {
      if (story.status && statusNormalization[story.status.toLowerCase()]) {
        const oldStatus = story.status;
        story.status = statusNormalization[story.status.toLowerCase()];
        normalizedCount++;
        logMigration(`Normalized ${storyId} status: ${oldStatus} -> ${story.status}`);
      }
    }
  }

  // Add migration metadata
  migrated.migrated_at = new Date().toISOString();
  migrated.migrated_from = '1.0.0';

  logMigration(`Migration to 2.0.0 complete. Normalized ${normalizedCount} story statuses.`);

  return migrated;
}

/**
 * Registry of migration functions
 * Key: "fromVersion->toVersion"
 */
const MIGRATIONS = {
  '1.0.0->2.0.0': migrate_1_0_0_to_2_0_0,
};

/**
 * Get the migration path from one version to another
 * @param {string} fromVersion - Starting version
 * @param {string} toVersion - Target version
 * @returns {Array<string>} Array of version steps
 */
function getMigrationPath(fromVersion, toVersion) {
  // For now, simple direct path
  // Future: implement graph traversal for multi-step migrations
  const path = [];

  if (compareVersions(fromVersion, '2.0.0') < 0 && compareVersions(toVersion, '2.0.0') >= 0) {
    path.push('1.0.0->2.0.0');
  }

  return path;
}

/**
 * Migrate status.json data to the current schema version
 * @param {Object} data - Parsed status.json data
 * @param {Object} [options] - Migration options
 * @param {boolean} [options.dryRun=false] - If true, don't modify data
 * @returns {{ data: Object, migrated: boolean, fromVersion: string, toVersion: string, log: Array }}
 */
function migrate(data, options = {}) {
  const { dryRun = false } = options;

  clearMigrationLog();

  const fromVersion = detectSchemaVersion(data);
  const toVersion = CURRENT_SCHEMA_VERSION;

  // Already at current version
  if (compareVersions(fromVersion, toVersion) >= 0) {
    return {
      data,
      migrated: false,
      fromVersion,
      toVersion,
      log: getMigrationLog(),
    };
  }

  logMigration(`Detected schema version: ${fromVersion}`);
  logMigration(`Target schema version: ${toVersion}`);

  // Get migration path
  const migrationPath = getMigrationPath(fromVersion, toVersion);

  if (migrationPath.length === 0) {
    logMigration('No migration path found');
    return {
      data,
      migrated: false,
      fromVersion,
      toVersion,
      log: getMigrationLog(),
    };
  }

  let migratedData = dryRun ? JSON.parse(JSON.stringify(data)) : data;

  // Apply each migration in sequence
  for (const step of migrationPath) {
    const migrationFn = MIGRATIONS[step];
    if (!migrationFn) {
      throw new Error(`Missing migration function for: ${step}`);
    }
    logMigration(`Applying migration: ${step}`);
    migratedData = migrationFn(migratedData);
  }

  return {
    data: migratedData,
    migrated: true,
    fromVersion,
    toVersion,
    log: getMigrationLog(),
  };
}

/**
 * Load status.json with automatic migration
 * @param {string} filePath - Path to status.json
 * @param {Object} [options] - Options
 * @param {boolean} [options.autoSave=true] - Automatically save migrated data
 * @returns {{ data: Object, migrated: boolean, fromVersion: string, toVersion: string, log: Array }}
 */
function loadWithMigration(filePath, options = {}) {
  const { autoSave = true } = options;

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf8');
  let data;
  try {
    data = JSON.parse(content);
  } catch (e) {
    throw new Error(`Invalid JSON in ${filePath}: ${e.message}`);
  }

  const result = migrate(data);

  // Auto-save if migration occurred
  if (result.migrated && autoSave) {
    const backupPath = `${filePath}.backup.${Date.now()}`;
    fs.writeFileSync(backupPath, content);
    logMigration(`Created backup: ${backupPath}`);

    fs.writeFileSync(filePath, JSON.stringify(result.data, null, 2) + '\n');
    logMigration(`Saved migrated data to: ${filePath}`);

    result.log = getMigrationLog();
  }

  return result;
}

/**
 * Check if data needs migration
 * @param {Object} data - Parsed status.json data
 * @returns {{ needsMigration: boolean, currentVersion: string, targetVersion: string }}
 */
function needsMigration(data) {
  const currentVersion = detectSchemaVersion(data);
  return {
    needsMigration: compareVersions(currentVersion, CURRENT_SCHEMA_VERSION) < 0,
    currentVersion,
    targetVersion: CURRENT_SCHEMA_VERSION,
  };
}

/**
 * Validate migrated data against expected schema
 * @param {Object} data - Data to validate
 * @returns {{ valid: boolean, errors: Array<string> }}
 */
function validateSchema(data) {
  const errors = [];

  // Check required fields for v2.0.0
  if (!data.schema_version) {
    errors.push('Missing required field: schema_version');
  }

  // Check stories structure
  if (data.stories) {
    for (const [storyId, story] of Object.entries(data.stories)) {
      if (!story.title) {
        errors.push(`Story ${storyId} missing required field: title`);
      }
      if (!story.status) {
        errors.push(`Story ${storyId} missing required field: status`);
      }
      // Use VALID_STATUSES from story-state-machine.js (single source of truth)
      if (story.status && !VALID_STATUSES.includes(story.status)) {
        errors.push(`Story ${storyId} has invalid status: ${story.status}`);
      }
    }
  }

  // Check epics structure
  if (data.epics) {
    for (const [epicId, epic] of Object.entries(data.epics)) {
      if (!epic.title) {
        errors.push(`Epic ${epicId} missing required field: title`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

module.exports = {
  CURRENT_SCHEMA_VERSION,
  parseVersion,
  compareVersions,
  detectSchemaVersion,
  migrate,
  loadWithMigration,
  needsMigration,
  validateSchema,
  getMigrationLog,
  clearMigrationLog,
  // For testing
  migrate_1_0_0_to_2_0_0,
  getMigrationPath,
};
