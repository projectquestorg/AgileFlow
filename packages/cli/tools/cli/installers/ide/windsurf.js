/**
 * AgileFlow CLI - Windsurf IDE Installer
 *
 * Installs AgileFlow workflows for Windsurf IDE.
 * Windsurf uses markdown files in .windsurf/workflows/
 */

const path = require('node:path');
const fs = require('fs-extra');
const { BaseIdeSetup } = require('./_base-ide');

/**
 * Windsurf IDE setup handler
 */
class WindsurfSetup extends BaseIdeSetup {
  constructor() {
    super('windsurf', 'Windsurf', true);
    this.configDir = '.windsurf';
    this.workflowsDir = 'workflows';
  }

  /**
   * Setup Windsurf IDE configuration
   * @param {string} projectDir - Project directory
   * @param {string} agileflowDir - AgileFlow installation directory
   * @param {Object} options - Setup options
   */
  async setup(projectDir, agileflowDir, options = {}) {
    return this.setupStandard(projectDir, agileflowDir, {
      targetSubdir: this.workflowsDir,
      agileflowFolder: 'agileflow',
      commandLabel: 'workflows',
      agentLabel: 'agent workflows',
    });
  }

  /**
   * Cleanup old AgileFlow installation
   * @param {string} projectDir - Project directory
   */
  async cleanup(projectDir) {
    const agileflowPath = path.join(projectDir, this.configDir, this.workflowsDir, 'agileflow');
    if (await this.exists(agileflowPath)) {
      await fs.remove(agileflowPath);
      console.log(chalk.dim(`    Removed old AgileFlow workflows from ${this.displayName}`));
    }
  }
}

module.exports = { WindsurfSetup };
