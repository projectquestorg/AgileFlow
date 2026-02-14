/**
 * AgileFlow CLI - IDE Registry
 *
 * Centralized registry of supported IDEs with their metadata.
 * This eliminates duplicate IDE configuration scattered across commands.
 *
 * Enhanced as part of US-0178: Consolidate IDE installer config into unified registry pattern
 *
 * Usage:
 *   const { IdeRegistry } = require('./lib/ide-registry');
 *   const configPath = IdeRegistry.getConfigPath('claude-code', projectDir);
 *   const displayName = IdeRegistry.getDisplayName('cursor');
 *   const config = IdeRegistry.get('windsurf');
 */

const path = require('path');

/**
 * IDE metadata definition
 * @typedef {Object} IdeMetadata
 * @property {string} name - Internal IDE name (e.g., 'claude-code')
 * @property {string} displayName - Human-readable name (e.g., 'Claude Code')
 * @property {string} configDir - Base config directory (e.g., '.claude')
 * @property {string} commandsSubdir - Subdirectory for commands (e.g., 'commands', 'workflows')
 * @property {string} agileflowFolder - AgileFlow folder name (e.g., 'agileflow', 'AgileFlow')
 * @property {string} targetSubdir - Full target path (computed from commandsSubdir + agileflowFolder)
 * @property {boolean} preferred - Whether this is a preferred IDE
 * @property {string} description - Short description for UI
 * @property {string} [handler] - Handler class name (e.g., 'ClaudeCodeSetup')
 * @property {Object} labels - Custom labels for installed content
 * @property {Object} features - Feature flags for this IDE
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
    commandsSubdir: 'commands',
    agileflowFolder: 'agileflow',
    targetSubdir: 'commands/agileflow', // lowercase
    preferred: true,
    description: "Anthropic's Claude Code IDE",
    handler: 'ClaudeCodeSetup',
    labels: {
      commands: 'commands',
      agents: 'agents',
    },
    features: {
      spawnableAgents: true, // Has .claude/agents/ for Task tool
      skills: true, // Has .claude/skills/ for user skills
      damageControl: true, // Supports PreToolUse hooks
    },
  },
  cursor: {
    name: 'cursor',
    displayName: 'Cursor',
    configDir: '.cursor',
    commandsSubdir: 'commands',
    agileflowFolder: 'AgileFlow',
    targetSubdir: 'commands/AgileFlow', // PascalCase
    preferred: false,
    description: 'AI-powered code editor',
    handler: 'CursorSetup',
    labels: {
      commands: 'commands',
      agents: 'agents',
    },
    features: {
      spawnableAgents: false,
      skills: false,
      damageControl: false,
    },
  },
  windsurf: {
    name: 'windsurf',
    displayName: 'Windsurf',
    configDir: '.windsurf',
    commandsSubdir: 'workflows',
    agileflowFolder: 'agileflow',
    targetSubdir: 'workflows/agileflow', // lowercase
    preferred: false,
    description: "Codeium's AI IDE",
    handler: 'WindsurfSetup',
    labels: {
      commands: 'workflows',
      agents: 'agent workflows',
    },
    features: {
      spawnableAgents: false,
      skills: false,
      damageControl: false,
    },
  },
  codex: {
    name: 'codex',
    displayName: 'OpenAI Codex',
    configDir: '.codex',
    commandsSubdir: 'skills',
    agileflowFolder: 'agileflow',
    targetSubdir: 'skills', // Codex uses skills directory
    preferred: false,
    description: "OpenAI's Codex",
    handler: 'CodexSetup',
    labels: {
      commands: 'prompts',
      agents: 'skills',
    },
    features: {
      spawnableAgents: false,
      skills: true, // Has .codex/skills/
      damageControl: false,
      customInstall: true, // Uses custom install flow (not setupStandard)
      agentsMd: true, // Creates AGENTS.md at project root
    },
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

  /**
   * Get IDE choices formatted for UI selection (inquirer checkbox format)
   * @returns {Array} Array of {name, value, checked, configDir, description}
   */
  static getChoices() {
    return Object.values(IDE_REGISTRY)
      .sort((a, b) => {
        // Preferred first, then alphabetical
        if (a.preferred && !b.preferred) return -1;
        if (!a.preferred && b.preferred) return 1;
        return a.displayName.localeCompare(b.displayName);
      })
      .map((ide, index) => ({
        name: ide.displayName,
        value: ide.name,
        checked: ide.preferred || index === 0,
        configDir: `${ide.configDir}/${ide.commandsSubdir}`,
        description: ide.description,
      }));
  }

  /**
   * Check if an IDE has a specific feature
   * @param {string} ideName - IDE name
   * @param {string} featureName - Feature to check
   * @returns {boolean}
   */
  static hasFeature(ideName, featureName) {
    const ide = IDE_REGISTRY[ideName];
    return !!(ide && ide.features && ide.features[featureName]);
  }

  /**
   * Get all IDEs with a specific feature
   * @param {string} featureName - Feature to filter by
   * @returns {string[]} Array of IDE names
   */
  static getWithFeature(featureName) {
    return Object.entries(IDE_REGISTRY)
      .filter(([, meta]) => meta.features && meta.features[featureName])
      .map(([name]) => name);
  }

  /**
   * Get labels for an IDE (e.g., 'commands' vs 'workflows')
   * @param {string} ideName - IDE name
   * @returns {Object} Labels object {commands, agents}
   */
  static getLabels(ideName) {
    const ide = IDE_REGISTRY[ideName];
    return ide && ide.labels ? ide.labels : { commands: 'commands', agents: 'agents' };
  }
}

module.exports = {
  IdeRegistry,
  IDE_REGISTRY,
};
