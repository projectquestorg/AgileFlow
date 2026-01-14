/**
 * AgileFlow CLI - Cursor IDE Installer
 *
 * Installs AgileFlow commands for Cursor IDE.
 * Cursor uses plain Markdown files in .cursor/commands/
 */

const path = require('node:path');
const fs = require('fs-extra');
const chalk = require('chalk');
const { BaseIdeSetup } = require('./_base-ide');

/**
 * Cursor IDE setup handler
 */
class CursorSetup extends BaseIdeSetup {
  constructor() {
    super('cursor', 'Cursor', false);
    this.configDir = '.cursor';
    this.commandsDir = 'commands';
  }

  /**
   * Setup Cursor IDE configuration
   * @param {string} projectDir - Project directory
   * @param {string} agileflowDir - AgileFlow installation directory
   * @param {Object} options - Setup options
   */
  async setup(projectDir, agileflowDir, options = {}) {
    return this.setupStandard(projectDir, agileflowDir, {
      targetSubdir: this.commandsDir,
      agileflowFolder: 'AgileFlow',
    });
  }

  /**
   * Cleanup old AgileFlow installation
   * @param {string} projectDir - Project directory
   */
  async cleanup(projectDir) {
    // Remove old .cursor/rules/agileflow (deprecated)
    const oldRulesPath = path.join(projectDir, this.configDir, 'rules', 'agileflow');
    if (await this.exists(oldRulesPath)) {
      await fs.remove(oldRulesPath);
      console.log(chalk.dim(`    Removed old AgileFlow rules from ${this.displayName}`));
    }

    // Remove .cursor/commands/agileflow (for re-installation)
    const commandsPath = path.join(projectDir, this.configDir, this.commandsDir, 'AgileFlow');
    if (await this.exists(commandsPath)) {
      await fs.remove(commandsPath);
    }
  }
}

module.exports = { CursorSetup };
