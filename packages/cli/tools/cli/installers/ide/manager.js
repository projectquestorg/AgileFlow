/**
 * AgileFlow CLI - IDE Manager
 *
 * Manages IDE-specific installers and configuration.
 * Validates handlers implement the required interface before registration.
 */

const fs = require('fs-extra');
const path = require('node:path');
const chalk = require('chalk');
const { validateHandler } = require('./_interface');

/**
 * IDE Manager - handles IDE-specific setup
 */
class IdeManager {
  constructor() {
    this.handlers = new Map();
    this.agileflowFolder = '.agileflow';
    this.docsFolder = 'docs';
    this.loadHandlers();
  }

  /**
   * Set the AgileFlow folder name for all IDE handlers
   * @param {string} folderName - The AgileFlow folder name
   */
  setAgileflowFolder(folderName) {
    this.agileflowFolder = folderName;
    for (const handler of this.handlers.values()) {
      if (typeof handler.setAgileflowFolder === 'function') {
        handler.setAgileflowFolder(folderName);
      }
    }
  }

  /**
   * Set the docs folder name for all IDE handlers
   * @param {string} folderName - The docs folder name
   */
  setDocsFolder(folderName) {
    this.docsFolder = folderName;
    for (const handler of this.handlers.values()) {
      if (typeof handler.setDocsFolder === 'function') {
        handler.setDocsFolder(folderName);
      }
    }
  }

  /**
   * Dynamically load all IDE handlers from directory
   */
  loadHandlers() {
    const ideDir = __dirname;

    try {
      const files = fs.readdirSync(ideDir).filter(file => {
        return file.endsWith('.js') && !file.startsWith('_') && file !== 'manager.js';
      });

      files.sort();

      for (const file of files) {
        try {
          const modulePath = path.join(ideDir, file);
          const HandlerModule = require(modulePath);

          // Get the first exported class
          const HandlerClass = Object.values(HandlerModule)[0];

          if (HandlerClass && typeof HandlerClass === 'function') {
            const instance = new HandlerClass();

            // Validate handler implements required interface
            const validation = validateHandler(instance);

            if (!validation.valid) {
              console.log(
                chalk.yellow(
                  `  Warning: IDE handler ${file} failed validation: ${validation.errors.join(', ')}`
                )
              );
              continue; // Skip invalid handlers
            }

            if (instance.name) {
              this.handlers.set(instance.name, instance);
            }
          }
        } catch (error) {
          console.log(chalk.yellow(`  Warning: Could not load ${file}: ${error.message}`));
        }
      }
    } catch (error) {
      console.error(chalk.red('Failed to load IDE handlers:'), error.message);
    }
  }

  /**
   * Get all available IDEs
   * @returns {Array} Array of IDE information
   */
  getAvailableIdes() {
    const ides = [];

    for (const [key, handler] of this.handlers) {
      ides.push({
        value: key,
        name: handler.displayName || handler.name || key,
        preferred: handler.preferred || false,
      });
    }

    // Sort: preferred first, then alphabetical
    ides.sort((a, b) => {
      if (a.preferred && !b.preferred) return -1;
      if (!a.preferred && b.preferred) return 1;
      return a.name.localeCompare(b.name);
    });

    return ides;
  }

  /**
   * Get supported IDE names
   * @returns {Array} List of supported IDE names
   */
  getSupportedIdes() {
    return [...this.handlers.keys()];
  }

  /**
   * Check if an IDE is supported
   * @param {string} ideName - IDE name
   * @returns {boolean}
   */
  isSupported(ideName) {
    return this.handlers.has(ideName.toLowerCase());
  }

  /**
   * Setup IDE configuration
   * @param {string} ideName - IDE name
   * @param {string} projectDir - Project directory
   * @param {string} agileflowDir - AgileFlow directory
   * @param {Object} options - Setup options
   * @returns {Promise<Object>}
   */
  async setup(ideName, projectDir, agileflowDir, options = {}) {
    const handler = this.handlers.get(ideName.toLowerCase());

    if (!handler) {
      console.warn(chalk.yellow(`  ⚠ IDE '${ideName}' is not yet supported`));
      console.log(chalk.dim(`  Supported IDEs: ${[...this.handlers.keys()].join(', ')}`));
      return { success: false, reason: 'unsupported' };
    }

    try {
      const result = await handler.setup(projectDir, agileflowDir, options);
      return { success: true, ide: ideName, ...result };
    } catch (error) {
      console.error(chalk.red(`  Failed to setup ${ideName}:`), error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Setup multiple IDEs
   * @param {string[]} ideNames - List of IDE names
   * @param {string} projectDir - Project directory
   * @param {string} agileflowDir - AgileFlow directory
   * @param {Object} options - Setup options
   * @returns {Promise<Object>}
   */
  async setupMultiple(ideNames, projectDir, agileflowDir, options = {}) {
    const results = {};

    for (const ideName of ideNames) {
      results[ideName] = await this.setup(ideName, projectDir, agileflowDir, options);
    }

    return results;
  }

  /**
   * Cleanup all IDE configurations
   * @param {string} projectDir - Project directory
   */
  async cleanup(projectDir) {
    const results = [];

    for (const [name, handler] of this.handlers) {
      try {
        await handler.cleanup(projectDir);
        results.push({ ide: name, success: true });
      } catch (error) {
        results.push({ ide: name, success: false, error: error.message });
      }
    }

    return results;
  }

  /**
   * Detect installed IDEs
   * @param {string} projectDir - Project directory
   * @returns {Promise<Array>}
   */
  async detectInstalledIdes(projectDir) {
    const detected = [];

    for (const [name, handler] of this.handlers) {
      if (typeof handler.detect === 'function' && (await handler.detect(projectDir))) {
        detected.push(name);
      }
    }

    return detected;
  }
}

module.exports = { IdeManager };
