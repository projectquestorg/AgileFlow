/**
 * AgileFlow CLI - Configuration Manager
 *
 * Centralized configuration management with schema validation,
 * migration support, and consistent access patterns.
 *
 * Usage:
 *   const { ConfigManager } = require('./lib/config-manager');
 *   const config = await ConfigManager.load(projectDir);
 *   const userName = config.get('userName');
 */

const path = require('path');
const fs = require('fs-extra');
const { safeLoad, safeDump } = require('../../../lib/yaml-utils');

/**
 * Configuration schema definition
 * @typedef {Object} ConfigSchema
 * @property {string} type - Value type (string, array, boolean, number)
 * @property {*} default - Default value
 * @property {boolean} required - Whether the field is required
 * @property {Function} [validate] - Custom validation function
 */

/**
 * Configuration schema for AgileFlow manifest
 */
const CONFIG_SCHEMA = {
  version: {
    type: 'string',
    default: '0.0.0',
    required: true,
    validate: v => /^\d+\.\d+\.\d+/.test(v),
  },
  userName: {
    type: 'string',
    default: 'Developer',
    required: false,
  },
  ides: {
    type: 'array',
    default: ['claude-code'],
    required: true,
    validate: arr =>
      Array.isArray(arr) &&
      arr.every(ide => ['claude-code', 'cursor', 'windsurf', 'codex'].includes(ide)),
  },
  agileflowFolder: {
    type: 'string',
    default: '.agileflow',
    required: true,
    validate: v => typeof v === 'string' && v.length > 0 && !v.includes('..'),
  },
  docsFolder: {
    type: 'string',
    default: 'docs',
    required: true,
    validate: v => typeof v === 'string' && v.length > 0 && !v.includes('..'),
  },
  installedAt: {
    type: 'string',
    default: null,
    required: false,
  },
  updatedAt: {
    type: 'string',
    default: null,
    required: false,
  },
};

/**
 * Valid configuration keys (for external reference)
 */
const VALID_CONFIG_KEYS = Object.keys(CONFIG_SCHEMA);

/**
 * User-editable configuration keys
 */
const EDITABLE_CONFIG_KEYS = ['userName', 'ides', 'agileflowFolder', 'docsFolder'];

/**
 * Configuration Manager class
 */
class ConfigManager {
  /**
   * Create a new ConfigManager instance
   * @param {Object} data - Configuration data
   * @param {string} manifestPath - Path to manifest file
   */
  constructor(data = {}, manifestPath = null) {
    this._data = { ...data };
    this._manifestPath = manifestPath;
    this._dirty = false;
  }

  /**
   * Load configuration from a project directory
   * @param {string} projectDir - Project directory
   * @param {Object} options - Load options
   * @param {string} [options.agileflowFolder='.agileflow'] - AgileFlow folder name
   * @returns {Promise<ConfigManager>} ConfigManager instance
   */
  static async load(projectDir, options = {}) {
    const agileflowFolder = options.agileflowFolder || '.agileflow';
    const manifestPath = path.join(projectDir, agileflowFolder, '_cfg', 'manifest.yaml');

    let data = {};

    if (await fs.pathExists(manifestPath)) {
      try {
        const content = await fs.readFile(manifestPath, 'utf8');
        const parsed = safeLoad(content);
        // Normalize keys from snake_case to camelCase
        data = ConfigManager._normalizeKeys(parsed);
      } catch {
        // If manifest is corrupted, use defaults
        data = {};
      }
    }

    // Apply defaults for missing fields
    for (const [key, schema] of Object.entries(CONFIG_SCHEMA)) {
      if (data[key] === undefined && schema.default !== null) {
        data[key] = schema.default;
      }
    }

    return new ConfigManager(data, manifestPath);
  }

  /**
   * Normalize keys from snake_case to camelCase
   * @param {Object} obj - Object with snake_case keys
   * @returns {Object} Object with camelCase keys
   */
  static _normalizeKeys(obj) {
    const keyMap = {
      user_name: 'userName',
      agileflow_folder: 'agileflowFolder',
      docs_folder: 'docsFolder',
      installed_at: 'installedAt',
      updated_at: 'updatedAt',
    };

    const result = {};
    for (const [key, value] of Object.entries(obj || {})) {
      const normalizedKey = keyMap[key] || key;
      result[normalizedKey] = value;
    }
    return result;
  }

  /**
   * Denormalize keys from camelCase to snake_case for storage
   * @param {Object} obj - Object with camelCase keys
   * @returns {Object} Object with snake_case keys
   */
  static _denormalizeKeys(obj) {
    const keyMap = {
      userName: 'user_name',
      agileflowFolder: 'agileflow_folder',
      docsFolder: 'docs_folder',
      installedAt: 'installed_at',
      updatedAt: 'updated_at',
    };

    const result = {};
    for (const [key, value] of Object.entries(obj || {})) {
      const denormalizedKey = keyMap[key] || key;
      result[denormalizedKey] = value;
    }
    return result;
  }

  /**
   * Get a configuration value
   * @param {string} key - Configuration key
   * @returns {*} Configuration value
   */
  get(key) {
    const schema = CONFIG_SCHEMA[key];
    if (!schema) {
      return undefined;
    }
    return this._data[key] !== undefined ? this._data[key] : schema.default;
  }

  /**
   * Set a configuration value
   * @param {string} key - Configuration key
   * @param {*} value - Configuration value
   * @returns {{ok: boolean, error?: string}} Result
   */
  set(key, value) {
    const schema = CONFIG_SCHEMA[key];

    if (!schema) {
      return { ok: false, error: `Unknown configuration key: ${key}` };
    }

    if (!EDITABLE_CONFIG_KEYS.includes(key)) {
      return { ok: false, error: `Configuration key '${key}' is read-only` };
    }

    // Type validation
    const typeError = this._validateType(key, value, schema);
    if (typeError) {
      return { ok: false, error: typeError };
    }

    // Custom validation
    if (schema.validate && !schema.validate(value)) {
      return { ok: false, error: `Invalid value for '${key}'` };
    }

    this._data[key] = value;
    this._dirty = true;
    return { ok: true };
  }

  /**
   * Validate type of a value
   * @param {string} key - Configuration key
   * @param {*} value - Value to validate
   * @param {ConfigSchema} schema - Schema definition
   * @returns {string|null} Error message or null if valid
   */
  _validateType(key, value, schema) {
    switch (schema.type) {
      case 'string':
        if (typeof value !== 'string') {
          return `'${key}' must be a string`;
        }
        break;
      case 'array':
        if (!Array.isArray(value)) {
          return `'${key}' must be an array`;
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          return `'${key}' must be a boolean`;
        }
        break;
      case 'number':
        if (typeof value !== 'number') {
          return `'${key}' must be a number`;
        }
        break;
    }
    return null;
  }

  /**
   * Validate all configuration values
   * @returns {{ok: boolean, errors: string[]}} Validation result
   */
  validate() {
    const errors = [];

    for (const [key, schema] of Object.entries(CONFIG_SCHEMA)) {
      const value = this._data[key];

      // Check required fields
      if (schema.required && (value === undefined || value === null)) {
        errors.push(`Missing required field: ${key}`);
        continue;
      }

      // Skip validation for undefined optional fields
      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      const typeError = this._validateType(key, value, schema);
      if (typeError) {
        errors.push(typeError);
        continue;
      }

      // Custom validation
      if (schema.validate && !schema.validate(value)) {
        errors.push(`Invalid value for '${key}'`);
      }
    }

    return { ok: errors.length === 0, errors };
  }

  /**
   * Save configuration to manifest file
   * @returns {Promise<{ok: boolean, error?: string}>} Save result
   */
  async save() {
    if (!this._manifestPath) {
      return { ok: false, error: 'No manifest path set' };
    }

    try {
      // Update timestamp
      this._data.updatedAt = new Date().toISOString();

      // Ensure directory exists
      await fs.ensureDir(path.dirname(this._manifestPath));

      // Denormalize keys for storage
      const storageData = ConfigManager._denormalizeKeys(this._data);

      // Write to file
      await fs.writeFile(this._manifestPath, safeDump(storageData), 'utf8');

      this._dirty = false;
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  /**
   * Get all configuration data
   * @returns {Object} All configuration data
   */
  getAll() {
    const result = {};
    for (const key of VALID_CONFIG_KEYS) {
      result[key] = this.get(key);
    }
    return result;
  }

  /**
   * Check if configuration has unsaved changes
   * @returns {boolean}
   */
  isDirty() {
    return this._dirty;
  }

  /**
   * Get the manifest file path
   * @returns {string|null}
   */
  getManifestPath() {
    return this._manifestPath;
  }

  /**
   * Migrate configuration from an older format
   * @param {Object} oldData - Old configuration data
   * @returns {{ok: boolean, migrated: string[]}} Migration result
   */
  migrate(oldData) {
    const migrated = [];

    // Migration: rename 'name' to 'userName'
    if (oldData.name && !this._data.userName) {
      this._data.userName = oldData.name;
      migrated.push('name → userName');
      this._dirty = true;
    }

    // Migration: normalize IDE names
    if (this._data.ides) {
      const normalizedIdes = this._data.ides.map(ide => ide.toLowerCase());
      if (JSON.stringify(normalizedIdes) !== JSON.stringify(this._data.ides)) {
        this._data.ides = normalizedIdes;
        migrated.push('ides normalized to lowercase');
        this._dirty = true;
      }
    }

    // Migration: ensure agileflowFolder starts with dot
    if (
      this._data.agileflowFolder &&
      !this._data.agileflowFolder.startsWith('.') &&
      this._data.agileflowFolder !== 'agileflow'
    ) {
      // Only migrate if it looks like it should have a dot
      // Don't migrate 'agileflow' to '.agileflow' automatically
    }

    return { ok: true, migrated };
  }
}

module.exports = {
  ConfigManager,
  CONFIG_SCHEMA,
  VALID_CONFIG_KEYS,
  EDITABLE_CONFIG_KEYS,
};
