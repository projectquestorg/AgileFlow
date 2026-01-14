/**
 * AgileFlow CLI - Base IDE Installer
 *
 * Abstract base class for IDE-specific installers.
 */

const path = require('node:path');
const fs = require('fs-extra');
const chalk = require('chalk');
const {
  IdeConfigNotFoundError,
  CommandInstallationError,
  FilePermissionError,
  CleanupError,
  ContentInjectionError,
  withPermissionHandling,
} = require('../../lib/ide-errors');

/**
 * Base class for IDE-specific setup
 * All IDE handlers should extend this class
 */
class BaseIdeSetup {
  constructor(name, displayName = null, preferred = false) {
    this.name = name;
    this.displayName = displayName || name;
    this.preferred = preferred;
    this.configDir = null; // Override in subclasses
    this.agileflowFolder = '.agileflow';
    this.docsFolder = 'docs';
  }

  /**
   * Set the AgileFlow folder name
   * @param {string} folderName - The AgileFlow folder name
   */
  setAgileflowFolder(folderName) {
    this.agileflowFolder = folderName;
  }

  /**
   * Set the docs folder name
   * @param {string} folderName - The docs folder name
   */
  setDocsFolder(folderName) {
    this.docsFolder = folderName;
  }

  /**
   * Replace docs/ references in content with custom folder name
   * @param {string} content - File content
   * @returns {string} Updated content
   */
  replaceDocsReferences(content) {
    if (this.docsFolder === 'docs') {
      return content; // No replacement needed
    }

    // Replace all variations of docs/ references
    return content
      .replace(/docs\//g, `${this.docsFolder}/`)
      .replace(/`docs\//g, `\`${this.docsFolder}/`)
      .replace(/"docs\//g, `"${this.docsFolder}/`)
      .replace(/'docs\//g, `'${this.docsFolder}/`)
      .replace(/\(docs\//g, `(${this.docsFolder}/`)
      .replace(/docs\/\)/g, `${this.docsFolder}/)`)
      .replace(/\bdocs\b(?!\.)/g, this.docsFolder); // Replace standalone "docs" word
  }

  /**
   * Inject dynamic content into template (agent lists, command lists)
   * @param {string} content - Template file content
   * @param {string} agileflowDir - AgileFlow installation directory
   * @returns {string} Content with placeholders replaced
   */
  injectDynamicContent(content, agileflowDir) {
    const { injectContent } = require('../../lib/content-injector');
    // agileflowDir is the user's .agileflow installation directory
    // which has agents/, commands/, skills/ at the root level
    return injectContent(content, {
      coreDir: agileflowDir,
      agileflowFolder: this.agileflowFolder,
      version: this.getVersion(),
    });
  }

  /**
   * Get the current AgileFlow version
   * @returns {string} Version string
   */
  getVersion() {
    try {
      const packageJson = require('../../../../package.json');
      return packageJson.version || 'unknown';
    } catch {
      return 'unknown';
    }
  }

  /**
   * Main setup method - must be implemented by subclasses
   * @param {string} projectDir - Project directory
   * @param {string} agileflowDir - AgileFlow installation directory
   * @param {Object} options - Setup options
   */
  async setup(projectDir, agileflowDir, options = {}) {
    throw new Error(`setup() must be implemented by ${this.name} handler`);
  }

  /**
   * Standard setup flow shared by most IDE installers.
   * Handles cleanup, command/agent installation, and logging.
   *
   * @param {string} projectDir - Project directory
   * @param {string} agileflowDir - AgileFlow installation directory
   * @param {Object} config - Configuration options
   * @param {string} config.targetSubdir - Target subdirectory name under configDir (e.g., 'commands', 'workflows')
   * @param {string} config.agileflowFolder - AgileFlow folder name (e.g., 'agileflow', 'AgileFlow')
   * @param {string} [config.commandLabel='commands'] - Label for commands in output (e.g., 'workflows')
   * @param {string} [config.agentLabel='agents'] - Label for agents in output
   * @returns {Promise<{success: boolean, commands: number, agents: number}>}
   */
  async setupStandard(projectDir, agileflowDir, config) {
    const {
      targetSubdir,
      agileflowFolder,
      commandLabel = 'commands',
      agentLabel = 'agents',
    } = config;

    console.log(chalk.hex('#e8683a')(`  Setting up ${this.displayName}...`));

    // Clean up old installation first
    await this.cleanup(projectDir);

    // Create target directory (e.g., .cursor/commands/AgileFlow)
    const ideDir = path.join(projectDir, this.configDir);
    const targetDir = path.join(ideDir, targetSubdir);
    const agileflowTargetDir = path.join(targetDir, agileflowFolder);

    // Install commands using shared recursive method
    const commandsSource = path.join(agileflowDir, 'commands');
    const commandResult = await this.installCommandsRecursive(
      commandsSource,
      agileflowTargetDir,
      agileflowDir,
      true // Inject dynamic content
    );

    // Install agents as subdirectory
    const agentsSource = path.join(agileflowDir, 'agents');
    const agentsTargetDir = path.join(agileflowTargetDir, 'agents');
    const agentResult = await this.installCommandsRecursive(
      agentsSource,
      agentsTargetDir,
      agileflowDir,
      false // No dynamic content for agents
    );

    console.log(chalk.green(`  ✓ ${this.displayName} configured:`));
    console.log(chalk.dim(`    - ${commandResult.commands} ${commandLabel} installed`));
    console.log(chalk.dim(`    - ${agentResult.commands} ${agentLabel} installed`));
    console.log(chalk.dim(`    - Path: ${path.relative(projectDir, agileflowTargetDir)}`));

    return {
      success: true,
      commands: commandResult.commands,
      agents: agentResult.commands,
      ideDir,
      agileflowTargetDir,
    };
  }

  /**
   * Cleanup IDE configuration
   * @param {string} projectDir - Project directory
   * @throws {CleanupError} If cleanup fails
   */
  async cleanup(projectDir) {
    if (this.configDir) {
      // Clean up both old (AgileFlow) and new (agileflow) folder names
      for (const folderName of ['agileflow', 'AgileFlow']) {
        const agileflowPath = path.join(projectDir, this.configDir, 'commands', folderName);
        if (await fs.pathExists(agileflowPath)) {
          try {
            await fs.remove(agileflowPath);
            console.log(
              chalk.dim(`  Removed old ${folderName} configuration from ${this.displayName}`)
            );
          } catch (error) {
            if (error.code === 'EACCES' || error.code === 'EPERM') {
              throw new CleanupError(
                this.displayName,
                agileflowPath,
                `Permission denied: ${error.message}`
              );
            }
            throw new CleanupError(this.displayName, agileflowPath, error.message);
          }
        }
      }
    }
  }

  /**
   * Detect if this IDE is configured in the project
   * @param {string} projectDir - Project directory
   * @returns {Promise<boolean>}
   */
  async detect(projectDir) {
    if (this.configDir) {
      const configPath = path.join(projectDir, this.configDir);
      return fs.pathExists(configPath);
    }
    return false;
  }

  /**
   * Ensure a directory exists
   * @param {string} dirPath - Directory path
   */
  async ensureDir(dirPath) {
    await fs.ensureDir(dirPath);
  }

  /**
   * Write a file with permission error handling
   * @param {string} filePath - File path
   * @param {string} content - File content
   * @throws {FilePermissionError} If permission denied
   */
  async writeFile(filePath, content) {
    await withPermissionHandling(this.displayName, filePath, 'write', async () => {
      await fs.writeFile(filePath, content, 'utf8');
    });
  }

  /**
   * Read a file with permission error handling
   * @param {string} filePath - File path
   * @returns {Promise<string>} File content
   * @throws {FilePermissionError} If permission denied
   */
  async readFile(filePath) {
    return withPermissionHandling(this.displayName, filePath, 'read', async () => {
      return fs.readFile(filePath, 'utf8');
    });
  }

  /**
   * Check if a path exists
   * @param {string} filePath - Path to check
   * @returns {Promise<boolean>}
   */
  async exists(filePath) {
    return fs.pathExists(filePath);
  }

  /**
   * Scan a directory for files with a specific extension
   * @param {string} dirPath - Directory path
   * @param {string} extension - File extension (e.g., '.md')
   * @returns {Promise<Array>} List of files
   */
  async scanDirectory(dirPath, extension) {
    const results = [];

    if (!(await this.exists(dirPath))) {
      return results;
    }

    const entries = await fs.readdir(dirPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith(extension)) {
        results.push({
          name: entry.name.replace(extension, ''),
          path: path.join(dirPath, entry.name),
          filename: entry.name,
        });
      }
    }

    return results;
  }

  /**
   * Recursively install markdown files from source to target directory
   * Handles content injection and docs reference replacement.
   * @param {string} sourceDir - Source directory path
   * @param {string} targetDir - Target directory path
   * @param {string} agileflowDir - AgileFlow installation directory (for dynamic content)
   * @param {boolean} injectDynamic - Whether to inject dynamic content (only for top-level commands)
   * @returns {Promise<{commands: number, subdirs: number}>} Count of installed items
   * @throws {CommandInstallationError} If command installation fails
   * @throws {FilePermissionError} If permission denied
   */
  async installCommandsRecursive(sourceDir, targetDir, agileflowDir, injectDynamic = false) {
    let commandCount = 0;
    let subdirCount = 0;

    if (!(await this.exists(sourceDir))) {
      return { commands: 0, subdirs: 0 };
    }

    try {
      await this.ensureDir(targetDir);
    } catch (error) {
      if (error.code === 'EACCES' || error.code === 'EPERM') {
        throw new FilePermissionError(this.displayName, targetDir, 'write');
      }
      throw error;
    }

    const entries = await fs.readdir(sourceDir, { withFileTypes: true });

    for (const entry of entries) {
      const sourcePath = path.join(sourceDir, entry.name);
      const targetPath = path.join(targetDir, entry.name);

      if (entry.isFile() && entry.name.endsWith('.md')) {
        try {
          // Read and process .md file
          let content = await this.readFile(sourcePath);

          // Inject dynamic content if enabled (for top-level commands)
          if (injectDynamic) {
            try {
              content = this.injectDynamicContent(content, agileflowDir);
            } catch (injectionError) {
              throw new ContentInjectionError(this.displayName, sourcePath, injectionError.message);
            }
          }

          // Replace docs/ references with custom folder name
          content = this.replaceDocsReferences(content);

          await this.writeFile(targetPath, content);
          commandCount++;
        } catch (error) {
          // Re-throw typed errors as-is
          if (error.name && error.name.includes('Error') && error.ideName) {
            throw error;
          }
          throw new CommandInstallationError(this.displayName, entry.name, error.message, {
            sourcePath,
            targetPath,
          });
        }
      } else if (entry.isDirectory()) {
        // Recursively process subdirectory
        const subResult = await this.installCommandsRecursive(
          sourcePath,
          targetPath,
          agileflowDir,
          false // Don't inject dynamic content in subdirectories
        );
        commandCount += subResult.commands;
        subdirCount += 1 + subResult.subdirs;
      }
    }

    return { commands: commandCount, subdirs: subdirCount };
  }
}

module.exports = { BaseIdeSetup };
