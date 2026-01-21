/**
 * Registry Dependency Injection Module
 *
 * Provides dependency injection patterns for registry classes to enable:
 * - Easier testing with mock dependencies
 * - Configuration without modifying code
 * - Clear separation of concerns
 *
 * Usage:
 *   const { createContainer, createPlaceholderRegistry } = require('./registry-di');
 *
 *   // Create a container with custom dependencies
 *   const container = createContainer({
 *     sanitizer: mockSanitizer,
 *     fs: mockFs,
 *   });
 *
 *   // Create registry using container
 *   const registry = createPlaceholderRegistry(container);
 */

'use strict';

// Default dependencies
const fs = require('fs');
const path = require('path');

/**
 * @typedef {Object} IDependencyContainer
 * @property {Object} fs - File system module
 * @property {Object} path - Path module
 * @property {Object} sanitizer - Content sanitizer module
 * @property {Object} [logger] - Optional logger interface
 */

/**
 * @typedef {Object} ISanitizer
 * @property {Function} sanitize.count - Sanitize count values
 * @property {Function} sanitize.description - Sanitize description strings
 * @property {Function} sanitize.date - Sanitize date values
 * @property {Function} sanitize.version - Sanitize version strings
 * @property {Function} sanitize.folderName - Sanitize folder names
 * @property {Function} validatePlaceholderValue - Validate placeholder values
 * @property {Function} detectInjectionAttempt - Detect injection attempts
 * @property {Function} escapeMarkdown - Escape markdown characters
 */

/**
 * @typedef {Object} ILogger
 * @property {Function} debug - Debug level logging
 * @property {Function} info - Info level logging
 * @property {Function} warn - Warning level logging
 * @property {Function} error - Error level logging
 */

/**
 * Default no-op logger
 */
const noopLogger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

/**
 * Console logger adapter
 */
const consoleLogger = {
  debug: (...args) => console.debug('[Registry]', ...args),
  info: (...args) => console.log('[Registry]', ...args),
  warn: (...args) => console.warn('[Registry]', ...args),
  error: (...args) => console.error('[Registry]', ...args),
};

/**
 * Load default sanitizer module
 * @returns {ISanitizer}
 */
function loadDefaultSanitizer() {
  try {
    return require('./content-sanitizer');
  } catch (e) {
    // Return stub sanitizer if module not found
    return {
      sanitize: {
        count: v => (typeof v === 'number' ? Math.max(0, Math.floor(v)) : 0),
        description: v => String(v || ''),
        date: v => (v instanceof Date ? v.toISOString().split('T')[0] : String(v || '')),
        version: v => String(v || 'unknown'),
        folderName: v => String(v || '.agileflow'),
      },
      validatePlaceholderValue: () => ({ valid: true }),
      detectInjectionAttempt: () => ({ safe: true }),
      escapeMarkdown: v => String(v || ''),
    };
  }
}

/**
 * Create a dependency container with defaults
 * @param {Partial<IDependencyContainer>} [overrides={}] - Override specific dependencies
 * @returns {IDependencyContainer}
 */
function createContainer(overrides = {}) {
  const defaultSanitizer = loadDefaultSanitizer();

  return {
    fs: overrides.fs || fs,
    path: overrides.path || path,
    sanitizer: overrides.sanitizer || defaultSanitizer,
    logger: overrides.logger || noopLogger,
  };
}

/**
 * Create a test container with mock-friendly defaults
 * @param {Partial<IDependencyContainer>} [overrides={}] - Override specific dependencies
 * @returns {IDependencyContainer}
 */
function createTestContainer(overrides = {}) {
  const mockFs = {
    readdirSync: () => [],
    readFileSync: () => '',
    existsSync: () => false,
    writeFileSync: () => {},
    mkdirSync: () => {},
    ...overrides.fs,
  };

  const mockSanitizer = {
    sanitize: {
      count: v => v,
      description: v => v,
      date: v => v,
      version: v => v,
      folderName: v => v,
    },
    validatePlaceholderValue: () => ({ valid: true }),
    detectInjectionAttempt: () => ({ safe: true }),
    escapeMarkdown: v => v,
    ...overrides.sanitizer,
  };

  return createContainer({
    fs: mockFs,
    sanitizer: mockSanitizer,
    logger: overrides.logger || noopLogger,
    ...overrides,
  });
}

/**
 * Registry factory configuration
 * @typedef {Object} RegistryFactoryConfig
 * @property {Object} [options] - Registry options
 * @property {IDependencyContainer} [container] - Dependency container
 */

/**
 * Create PlaceholderRegistry with injected dependencies
 * @param {IDependencyContainer} container - Dependency container
 * @param {Object} [options={}] - Registry options
 * @returns {PlaceholderRegistry}
 */
function createPlaceholderRegistry(container, options = {}) {
  const { PlaceholderRegistry } = require('./placeholder-registry');

  // Create registry with injected container
  const registry = new PlaceholderRegistry({
    ...options,
    // Inject dependencies via context
    _container: container,
  });

  return registry;
}

/**
 * Scan registry factory - creates scanner functions with injected dependencies
 * @param {IDependencyContainer} container - Dependency container
 * @returns {Object} Scanner functions
 */
function createScannerFactory(container) {
  const { fs: fsModule, path: pathModule, logger } = container;

  /**
   * Generic file scanner
   * @param {string} directory - Directory to scan
   * @param {string} extension - File extension (e.g., '.md')
   * @param {Function} parser - Frontmatter parser function
   * @returns {Array} Parsed items
   */
  function scanDirectory(directory, extension, parser) {
    logger.debug(`Scanning directory: ${directory}`);

    if (!fsModule.existsSync(directory)) {
      logger.warn(`Directory not found: ${directory}`);
      return [];
    }

    let files;
    try {
      files = fsModule.readdirSync(directory);
    } catch (err) {
      logger.error(`Failed to read directory: ${err.message}`);
      return [];
    }

    const items = [];

    for (const file of files) {
      if (!file.endsWith(extension)) {
        continue;
      }

      const filePath = pathModule.join(directory, file);

      try {
        const content = fsModule.readFileSync(filePath, 'utf8');
        const parsed = parser(content, file, filePath);

        if (parsed) {
          items.push(parsed);
        }
      } catch (err) {
        logger.warn(`Failed to parse ${file}: ${err.message}`);
      }
    }

    logger.debug(`Found ${items.length} items`);
    return items;
  }

  return {
    scanDirectory,

    /**
     * Scan for command files
     * @param {string} commandsDir - Commands directory path
     * @param {Function} extractFrontmatter - Frontmatter extractor
     * @returns {Array} Command metadata
     */
    scanCommands(commandsDir, extractFrontmatter) {
      return scanDirectory(commandsDir, '.md', (content, file, filePath) => {
        const frontmatter = extractFrontmatter(filePath);
        if (Object.keys(frontmatter).length === 0) {
          return null;
        }

        const name = file.replace('.md', '');
        return {
          name,
          file,
          path: filePath,
          description: frontmatter.description || '',
          argumentHint: frontmatter['argument-hint'] || '',
        };
      });
    },

    /**
     * Scan for agent files
     * @param {string} agentsDir - Agents directory path
     * @param {Function} extractFrontmatter - Frontmatter extractor
     * @param {Function} normalizeTools - Tools normalizer
     * @returns {Array} Agent metadata
     */
    scanAgents(agentsDir, extractFrontmatter, normalizeTools) {
      return scanDirectory(agentsDir, '.md', (content, file, filePath) => {
        const frontmatter = extractFrontmatter(filePath);
        if (Object.keys(frontmatter).length === 0) {
          return null;
        }

        const name = file.replace('.md', '');
        const tools = normalizeTools ? normalizeTools(frontmatter.tools) : frontmatter.tools || [];

        return {
          name,
          file,
          path: filePath,
          displayName: frontmatter.name || name,
          description: frontmatter.description || '',
          tools,
          model: frontmatter.model || 'haiku',
          color: frontmatter.color || 'blue',
        };
      });
    },
  };
}

/**
 * Resolve paths factory - creates path resolver with injected dependencies
 * @param {IDependencyContainer} container - Dependency container
 * @param {string} [baseDir] - Base directory for relative paths
 * @returns {Object} Path resolver functions
 */
function createPathResolver(container, baseDir) {
  const { path: pathModule, fs: fsModule } = container;
  const resolvedBaseDir = baseDir || process.cwd();

  return {
    /**
     * Resolve path relative to base directory
     * @param {...string} segments - Path segments
     * @returns {string} Resolved path
     */
    resolve(...segments) {
      return pathModule.resolve(resolvedBaseDir, ...segments);
    },

    /**
     * Join path segments
     * @param {...string} segments - Path segments
     * @returns {string} Joined path
     */
    join(...segments) {
      return pathModule.join(...segments);
    },

    /**
     * Check if path exists
     * @param {string} targetPath - Path to check
     * @returns {boolean}
     */
    exists(targetPath) {
      return fsModule.existsSync(targetPath);
    },

    /**
     * Get base directory
     * @returns {string}
     */
    getBaseDir() {
      return resolvedBaseDir;
    },
  };
}

module.exports = {
  // Container factories
  createContainer,
  createTestContainer,

  // Registry factories
  createPlaceholderRegistry,
  createScannerFactory,
  createPathResolver,

  // Loggers
  noopLogger,
  consoleLogger,

  // Utilities
  loadDefaultSanitizer,
};
