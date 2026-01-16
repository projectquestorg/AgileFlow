/**
 * AgileFlow CLI - IDE Registry
 *
 * Centralized registry of supported IDEs with their metadata.
 * This eliminates duplicate IDE configuration scattered across commands.
 *
 * Usage:
 *   const { IdeRegistry } = require('./lib/ide-registry');
 *   const configPath = IdeRegistry.getConfigPath('claude-code', projectDir);
 *   const displayName = IdeRegistry.getDisplayName('cursor');
 */

const path = require('path');

/**
 * IDE metadata definition
 * @typedef {Object} IdeMetadata
 * @property {string} name - Internal IDE name (e.g., 'claude-code')
 * @property {string} displayName - Human-readable name (e.g., 'Claude Code')
 * @property {string} configDir - Base config directory (e.g., '.claude')
 * @property {string} targetSubdir - Target subdirectory for commands (e.g., 'commands/agileflow')
 * @property {boolean} preferred - Whether this is a preferred IDE
 * @property {string} [handler] - Handler class name (e.g., 'ClaudeCodeSetup')
 */

/**
 * Registry of all supported IDEs
 * @type {Object.<string, IdeMetadata>}
 */
const IDE_REGISTRY = {
  'claude-code': {
    name: 'claude-code',
    displayName: 'Claude Code',
    configDir: '.claude',
    targetSubdir: 'commands/agileflow', // lowercase
    preferred: true,
    handler: 'ClaudeCodeSetup',
  },
  cursor: {
    name: 'cursor',
    displayName: 'Cursor',
    configDir: '.cursor',
    targetSubdir: 'commands/AgileFlow', // PascalCase
    preferred: false,
    handler: 'CursorSetup',
  },
  windsurf: {
    name: 'windsurf',
    displayName: 'Windsurf',
    configDir: '.windsurf',
    targetSubdir: 'workflows/agileflow', // lowercase
    preferred: true,
    handler: 'WindsurfSetup',
  },
  codex: {
    name: 'codex',
    displayName: 'OpenAI Codex CLI',
    configDir: '.codex',
    targetSubdir: 'skills', // Codex uses skills directory
    preferred: false,
    handler: 'CodexSetup',
  },
};

/**
 * IDE Registry class providing centralized IDE metadata access
 */
class IdeRegistry {
  /**
   * Get all registered IDE names
   * @returns {string[]} List of IDE names
   */
  static getAll() {
    return Object.keys(IDE_REGISTRY);
  }

  /**
   * Get all IDE metadata
   * @returns {Object.<string, IdeMetadata>} All IDE metadata
   */
  static getAllMetadata() {
    return { ...IDE_REGISTRY };
  }

  /**
   * Get metadata for a specific IDE
   * @param {string} ideName - IDE name
   * @returns {IdeMetadata|null} IDE metadata or null if not found
   */
  static get(ideName) {
    return IDE_REGISTRY[ideName] || null;
  }

  /**
   * Check if an IDE is registered
   * @param {string} ideName - IDE name
   * @returns {boolean}
   */
  static exists(ideName) {
    return ideName in IDE_REGISTRY;
  }

  /**
   * Get the config path for an IDE in a project
   * @param {string} ideName - IDE name
   * @param {string} projectDir - Project directory
   * @returns {string} Full path to IDE config directory
   */
  static getConfigPath(ideName, projectDir) {
    const ide = IDE_REGISTRY[ideName];
    if (!ide) {
      return '';
    }
    return path.join(projectDir, ide.configDir, ide.targetSubdir);
  }

  /**
   * Get the base config directory for an IDE (e.g., .claude, .cursor)
   * @param {string} ideName - IDE name
   * @param {string} projectDir - Project directory
   * @returns {string} Full path to base config directory
   */
  static getBaseDir(ideName, projectDir) {
    const ide = IDE_REGISTRY[ideName];
    if (!ide) {
      return '';
    }
    return path.join(projectDir, ide.configDir);
  }

  /**
   * Get the display name for an IDE
   * @param {string} ideName - IDE name
   * @returns {string} Display name or the original name if not found
   */
  static getDisplayName(ideName) {
    const ide = IDE_REGISTRY[ideName];
    return ide ? ide.displayName : ideName;
  }

  /**
   * Get all preferred IDEs
   * @returns {string[]} List of preferred IDE names
   */
  static getPreferred() {
    return Object.entries(IDE_REGISTRY)
      .filter(([, meta]) => meta.preferred)
      .map(([name]) => name);
  }

  /**
   * Validate IDE name
   * @param {string} ideName - IDE name to validate
   * @returns {{ok: boolean, error?: string}} Validation result
   */
  static validate(ideName) {
    if (!ideName || typeof ideName !== 'string') {
      return { ok: false, error: 'IDE name must be a non-empty string' };
    }

    if (!IDE_REGISTRY[ideName]) {
      const validNames = Object.keys(IDE_REGISTRY).join(', ');
      return {
        ok: false,
        error: `Unknown IDE: '${ideName}'. Valid options: ${validNames}`,
      };
    }

    return { ok: true };
  }

  /**
   * Get handler class name for an IDE
   * @param {string} ideName - IDE name
   * @returns {string|null} Handler class name or null
   */
  static getHandler(ideName) {
    const ide = IDE_REGISTRY[ideName];
    return ide ? ide.handler : null;
  }
}

module.exports = {
  IdeRegistry,
  IDE_REGISTRY,
};
