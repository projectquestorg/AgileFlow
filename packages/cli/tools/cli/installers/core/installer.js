/**
 * AgileFlow CLI - Core Installer
 *
 * Handles the main installation logic for AgileFlow.
 */

const path = require('node:path');
const fs = require('fs-extra');
const chalk = require('chalk');
const ora = require('ora');
const yaml = require('js-yaml');
const { injectContent } = require('../../lib/content-injector');
const { sha256Hex, toPosixPath, safeTimestampForPath } = require('../../lib/utils');

const TEXT_EXTENSIONS = new Set(['.md', '.yaml', '.yml', '.txt', '.json']);

/**
 * Get the source path for AgileFlow content
 * @returns {string} Path to src directory
 */
function getSourcePath() {
  return path.join(__dirname, '..', '..', '..', '..', 'src');
}

/**
 * Get the package root path
 * @returns {string} Path to package root
 */
function getPackageRoot() {
  return path.join(__dirname, '..', '..', '..', '..');
}

/**
 * Core Installer class
 */
class Installer {
  constructor() {
    this.sourcePath = getSourcePath();
    this.packageRoot = getPackageRoot();
    this.coreDir = path.join(this.sourcePath, 'core');

    // Load version from package.json
    const packageJson = require(path.join(this.packageRoot, 'package.json'));
    this.version = packageJson.version;
  }

  /**
   * Clean up existing content directories before installing.
   * Removes agents/, commands/, skills/, scripts/, templates/ but preserves _cfg/ and config.yaml.
   * @param {string} agileflowDir - AgileFlow installation directory
   */
  async cleanup(agileflowDir) {
    const dirsToRemove = ['agents', 'commands', 'skills', 'scripts', 'templates'];

    for (const dir of dirsToRemove) {
      const dirPath = path.join(agileflowDir, dir);
      if (await fs.pathExists(dirPath)) {
        await fs.remove(dirPath);
      }
    }
  }

  /**
   * Install AgileFlow to a project
   * @param {Object} config - Installation configuration
   * @param {Object} options - Installation options
   * @param {boolean} options.force - Overwrite local changes
   * @returns {Promise<Object>} Installation result
   */
  async install(config, options = {}) {
    const { directory, ides, userName, agileflowFolder, docsFolder } = config;
    const requestedForce = Boolean(options.force);

    const agileflowDir = path.join(directory, agileflowFolder);
    const spinner = ora('Installing AgileFlow...').start();

    try {
      // Create AgileFlow directory
      await fs.ensureDir(agileflowDir);
      spinner.text = 'Creating directory structure...';

      // Create _cfg directory for manifest
      const cfgDir = path.join(agileflowDir, '_cfg');
      await fs.ensureDir(cfgDir);

      const manifestPath = path.join(cfgDir, 'manifest.yaml');
      const fileIndexPath = path.join(cfgDir, 'files.json');

      const hasManifest = await fs.pathExists(manifestPath);
      const existingFileIndex = await this.readFileIndex(fileIndexPath);
      const hasValidFileIndex = Boolean(existingFileIndex);

      // Migration: installation predates file indexing
      const isMigration = hasManifest && !hasValidFileIndex;
      const effectiveForce = requestedForce || isMigration;

      const timestamp = safeTimestampForPath();
      let backupPath = null;
      if (isMigration) {
        spinner.text = 'Backing up existing installation...';
        backupPath = await this.createBackup(agileflowDir, cfgDir, timestamp);
      }

      // Clean up existing content directories to remove stale files
      // This happens AFTER backup so we can restore if needed
      spinner.text = 'Cleaning up old content...';
      await this.cleanup(agileflowDir);

      // Reset file index since we removed all content - start fresh
      const fileIndex = { schema: 1, files: {} };

      const fileOps = {
        created: 0,
        updated: 0,
        preserved: 0,
        stashed: 0,
        backupPath,
        updatesPath: null,
        isMigration,
        force: effectiveForce,
      };

      // Copy core content
      spinner.text = 'Installing core content...';
      const coreSourcePath = path.join(this.sourcePath, 'core');

      if (await fs.pathExists(coreSourcePath)) {
        await this.copyContent(coreSourcePath, agileflowDir, agileflowFolder, {
          agileflowDir,
          cfgDir,
          fileIndex,
          fileOps,
          force: effectiveForce,
          timestamp,
        });
      } else {
        // Fallback: copy from old structure (commands, agents, skills at root)
        await this.copyLegacyContent(directory, agileflowDir, agileflowFolder, {
          agileflowDir,
          cfgDir,
          fileIndex,
          fileOps,
          force: effectiveForce,
          timestamp,
        });
      }

      // Copy essential scripts to user's scripts/ directory
      spinner.text = 'Installing scripts...';
      await this.installScripts(directory, { force: effectiveForce });

      // Copy lib/ directory (shared utilities used by scripts)
      spinner.text = 'Installing shared libraries...';
      await this.installLib(directory, { force: effectiveForce });

      // Copy CHANGELOG.md for /agileflow:whats-new command
      spinner.text = 'Installing changelog...';
      await this.installChangelog(agileflowDir, { force: effectiveForce });

      // Create config.yaml
      spinner.text = 'Creating configuration...';
      await this.createConfig(agileflowDir, userName, agileflowFolder, { force: effectiveForce });

      // Create manifest
      spinner.text = 'Creating manifest...';
      await this.createManifest(
        cfgDir,
        { ides, userName, agileflowFolder, docsFolder },
        { force: effectiveForce }
      );

      // Persist file index (used for safe future updates)
      spinner.text = 'Writing file index...';
      await this.writeFileIndex(fileIndexPath, fileIndex);

      // Count installed items
      const counts = await this.countInstalledItems(agileflowDir);

      spinner.succeed('Core installation complete');

      return {
        success: true,
        path: agileflowDir,
        projectDir: directory,
        counts,
        fileOps,
      };
    } catch (error) {
      spinner.fail('Installation failed');
      throw error;
    }
  }

  /**
   * Copy content from source to destination with placeholder replacement
   * @param {string} source - Source directory
   * @param {string} dest - Destination directory
   * @param {string} agileflowFolder - AgileFlow folder name
   * @param {Object|null} policy - Copy policy (safe update behavior)
   */
  async copyContent(source, dest, agileflowFolder, policy = null) {
    const entries = await fs.readdir(source, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(source, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await fs.ensureDir(destPath);
        await this.copyContent(srcPath, destPath, agileflowFolder, policy);
      } else {
        if (policy) {
          await this.copyFileWithPolicy(srcPath, destPath, agileflowFolder, policy);
        } else {
          await this.copyFileWithReplacements(srcPath, destPath, agileflowFolder);
        }
      }
    }
  }

  /**
   * Copy legacy content structure (from root commands/agents/skills)
   * @param {string} projectDir - Project directory
   * @param {string} agileflowDir - AgileFlow installation directory
   * @param {string} agileflowFolder - AgileFlow folder name
   * @param {Object|null} policy - Copy policy (safe update behavior)
   */
  async copyLegacyContent(projectDir, agileflowDir, agileflowFolder, policy = null) {
    const packageRoot = this.packageRoot;

    // Copy commands
    const commandsSource = path.join(packageRoot, 'commands');
    const commandsDest = path.join(agileflowDir, 'commands');
    if (await fs.pathExists(commandsSource)) {
      await fs.ensureDir(commandsDest);
      await this.copyContent(commandsSource, commandsDest, agileflowFolder, policy);
    }

    // Copy agents
    const agentsSource = path.join(packageRoot, 'agents');
    const agentsDest = path.join(agileflowDir, 'agents');
    if (await fs.pathExists(agentsSource)) {
      await fs.ensureDir(agentsDest);
      await this.copyContent(agentsSource, agentsDest, agileflowFolder, policy);
    }

    // Copy skills
    const skillsSource = path.join(packageRoot, 'skills');
    const skillsDest = path.join(agileflowDir, 'skills');
    if (await fs.pathExists(skillsSource)) {
      await fs.ensureDir(skillsDest);
      await this.copyContent(skillsSource, skillsDest, agileflowFolder, policy);
    }
  }

  /**
   * Copy a file with placeholder replacements using content injector
   * @param {string} source - Source file path
   * @param {string} dest - Destination file path
   * @param {string} agileflowFolder - AgileFlow folder name
   */
  async copyFileWithReplacements(source, dest, agileflowFolder) {
    const ext = path.extname(source).toLowerCase();

    if (TEXT_EXTENSIONS.has(ext)) {
      let content = await fs.readFile(source, 'utf8');

      // Use content injector for all placeholder replacements
      content = injectContent(content, {
        coreDir: this.coreDir,
        agileflowFolder,
        version: this.version,
      });

      await fs.writeFile(dest, content, 'utf8');
    } else {
      await fs.copy(source, dest);
    }
  }

  /**
   * Copy a file with safe update behavior.
   * - If the destination file is unchanged since the last install, overwrite.
   * - If it has local changes, preserve and write the new version to _cfg/updates/<timestamp>/...
   * - If --force is set, overwrite all.
   * @param {string} source - Source file path
   * @param {string} dest - Destination file path
   * @param {string} agileflowFolder - AgileFlow folder name
   * @param {Object} policy - Copy policy
   */
  async copyFileWithPolicy(source, dest, agileflowFolder, policy) {
    const { agileflowDir, cfgDir, fileIndex, fileOps, force, timestamp } = policy;

    const relativePath = toPosixPath(path.relative(agileflowDir, dest));
    const maybeRecord = fileIndex.files[relativePath];
    const existingRecord = maybeRecord && typeof maybeRecord === 'object' ? maybeRecord : null;

    const ext = path.extname(source).toLowerCase();
    const isText = TEXT_EXTENSIONS.has(ext);

    let newContent;
    if (isText) {
      let content = await fs.readFile(source, 'utf8');
      // Use content injector for all placeholder replacements
      content = injectContent(content, {
        coreDir: this.coreDir,
        agileflowFolder,
        version: this.version,
      });
      newContent = content;
    } else {
      newContent = await fs.readFile(source);
    }

    const newHash = sha256Hex(newContent);
    const destExists = await fs.pathExists(dest);

    if (!destExists) {
      await fs.ensureDir(path.dirname(dest));
      if (isText) {
        await fs.writeFile(dest, newContent, 'utf8');
      } else {
        await fs.copy(source, dest);
      }

      fileIndex.files[relativePath] = { sha256: newHash, protected: false };
      fileOps.created++;
      return;
    }

    if (force) {
      if (isText) {
        await fs.writeFile(dest, newContent, 'utf8');
      } else {
        await fs.copy(source, dest);
      }

      fileIndex.files[relativePath] = { sha256: newHash, protected: false };
      fileOps.updated++;
      return;
    }

    const currentHash = await this.hashFile(dest);

    // Respect previously protected files unless they now match upstream.
    if (existingRecord && existingRecord.protected) {
      if (currentHash === newHash) {
        fileIndex.files[relativePath] = { sha256: newHash, protected: false };
        return;
      }

      await this.writeStash(cfgDir, timestamp, relativePath, isText, newContent, source, fileOps);
      fileIndex.files[relativePath] = { sha256: currentHash, protected: true };
      fileOps.preserved++;
      return;
    }

    // If we have a baseline hash and the file is unchanged since last install, we can update in place.
    if (existingRecord && existingRecord.sha256 === currentHash) {
      if (currentHash !== newHash) {
        if (isText) {
          await fs.writeFile(dest, newContent, 'utf8');
        } else {
          await fs.copy(source, dest);
        }
        fileOps.updated++;
      }

      fileIndex.files[relativePath] = { sha256: newHash, protected: false };
      return;
    }

    // Unknown or locally modified file: preserve and stash the new version for manual merge.
    if (currentHash === newHash) {
      fileIndex.files[relativePath] = { sha256: newHash, protected: false };
      return;
    }

    await this.writeStash(cfgDir, timestamp, relativePath, isText, newContent, source, fileOps);
    fileIndex.files[relativePath] = { sha256: currentHash, protected: true };
    fileOps.preserved++;
  }

  async writeStash(cfgDir, timestamp, relativePath, isText, newContent, source, fileOps) {
    const updatesRoot = path.join(cfgDir, 'updates', timestamp);
    const stashPath = path.join(updatesRoot, relativePath);

    await fs.ensureDir(path.dirname(stashPath));
    if (isText) {
      await fs.writeFile(stashPath, newContent, 'utf8');
    } else {
      await fs.copy(source, stashPath);
    }

    fileOps.stashed++;
    fileOps.updatesPath = updatesRoot;
  }

  async hashFile(filePath) {
    const data = await fs.readFile(filePath);
    return sha256Hex(data);
  }

  async readFileIndex(fileIndexPath) {
    if (!(await fs.pathExists(fileIndexPath))) return null;
    try {
      const index = await fs.readJson(fileIndexPath);
      if (!index || typeof index !== 'object') return null;
      if (index.schema !== 1) return null;
      if (!index.files || typeof index.files !== 'object') return null;
      return index;
    } catch {
      return null;
    }
  }

  async writeFileIndex(fileIndexPath, fileIndex) {
    const packageJson = require(path.join(this.packageRoot, 'package.json'));
    const nextIndex = {
      schema: 1,
      generated_at: new Date().toISOString(),
      version: packageJson.version,
      files: fileIndex.files || {},
    };

    await fs.writeJson(fileIndexPath, nextIndex, { spaces: 2 });
  }

  async createBackup(agileflowDir, cfgDir, timestamp) {
    const backupRoot = path.join(cfgDir, 'backups', timestamp);
    await fs.ensureDir(backupRoot);

    const candidates = ['agents', 'commands', 'skills', 'scripts', 'templates', 'config.yaml'];
    for (const name of candidates) {
      const srcPath = path.join(agileflowDir, name);
      if (await fs.pathExists(srcPath)) {
        await fs.copy(srcPath, path.join(backupRoot, name));
      }
    }

    const manifestPath = path.join(cfgDir, 'manifest.yaml');
    if (await fs.pathExists(manifestPath)) {
      await fs.copy(manifestPath, path.join(backupRoot, 'manifest.yaml'));
    }

    return backupRoot;
  }

  /**
   * Create configuration file
   * @param {string} agileflowDir - AgileFlow directory
   * @param {string} userName - User name
   * @param {string} agileflowFolder - AgileFlow folder name
   * @param {Object} options - Options
   * @param {boolean} options.force - Overwrite existing file
   */
  async createConfig(agileflowDir, userName, agileflowFolder, options = {}) {
    const configPath = path.join(agileflowDir, 'config.yaml');
    const packageJson = require(path.join(this.packageRoot, 'package.json'));

    if (!(await fs.pathExists(configPath))) {
      const config = {
        version: packageJson.version,
        user_name: userName,
        agileflow_folder: agileflowFolder,
        communication_language: 'English',
        created_at: new Date().toISOString(),
      };

      await fs.writeFile(configPath, yaml.dump(config), 'utf8');
      return;
    }

    try {
      const existingContent = await fs.readFile(configPath, 'utf8');
      const loaded = yaml.load(existingContent);
      const existing = loaded && typeof loaded === 'object' && !Array.isArray(loaded) ? loaded : {};

      const next = {
        ...existing,
        version: packageJson.version,
        user_name: userName,
        agileflow_folder: agileflowFolder,
        created_at: existing.created_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await fs.writeFile(configPath, yaml.dump(next), 'utf8');
    } catch {
      if (options.force) {
        const config = {
          version: packageJson.version,
          user_name: userName,
          agileflow_folder: agileflowFolder,
          communication_language: 'English',
          created_at: new Date().toISOString(),
        };

        await fs.writeFile(configPath, yaml.dump(config), 'utf8');
      }
    }
  }

  /**
   * Create manifest file
   * @param {string} cfgDir - Config directory
   * @param {Object} config - Manifest configuration
   * @param {Object} options - Options
   * @param {boolean} options.force - Overwrite existing file
   */
  async createManifest(cfgDir, config, options = {}) {
    const { ides, userName, agileflowFolder, docsFolder } = config;
    const packageJson = require(path.join(this.packageRoot, 'package.json'));

    const manifestPath = path.join(cfgDir, 'manifest.yaml');
    const now = new Date().toISOString();

    if (!(await fs.pathExists(manifestPath))) {
      const manifest = {
        version: packageJson.version,
        installed_at: now,
        updated_at: now,
        ides: ides,
        modules: ['core'],
        user_name: userName,
        agileflow_folder: agileflowFolder || '.agileflow',
        docs_folder: docsFolder || 'docs',
      };

      await fs.writeFile(manifestPath, yaml.dump(manifest), 'utf8');
      return;
    }

    try {
      const existingContent = await fs.readFile(manifestPath, 'utf8');
      const loaded = yaml.load(existingContent);
      const existing = loaded && typeof loaded === 'object' && !Array.isArray(loaded) ? loaded : {};

      const manifest = {
        ...existing,
        version: packageJson.version,
        installed_at: existing.installed_at || now,
        updated_at: now,
        ides: ides,
        modules: existing.modules || ['core'],
        user_name: userName,
        agileflow_folder: agileflowFolder || existing.agileflow_folder || '.agileflow',
        docs_folder: docsFolder || existing.docs_folder || 'docs',
      };

      await fs.writeFile(manifestPath, yaml.dump(manifest), 'utf8');
    } catch {
      if (options.force) {
        const manifest = {
          version: packageJson.version,
          installed_at: now,
          updated_at: now,
          ides: ides,
          modules: ['core'],
          user_name: userName,
          agileflow_folder: agileflowFolder || '.agileflow',
          docs_folder: docsFolder || 'docs',
        };

        await fs.writeFile(manifestPath, yaml.dump(manifest), 'utf8');
      }
    }
  }

  /**
   * Count installed items
   * @param {string} agileflowDir - AgileFlow directory
   * @returns {Promise<Object>} Counts
   */
  async countInstalledItems(agileflowDir) {
    const counts = {
      agents: 0,
      commands: 0,
      skills: 0,
    };

    // Count agents
    const agentsDir = path.join(agileflowDir, 'agents');
    if (await fs.pathExists(agentsDir)) {
      const files = await fs.readdir(agentsDir);
      counts.agents = files.filter(f => f.endsWith('.md')).length;
    }

    // Count commands
    const commandsDir = path.join(agileflowDir, 'commands');
    if (await fs.pathExists(commandsDir)) {
      const files = await fs.readdir(commandsDir);
      counts.commands = files.filter(f => f.endsWith('.md')).length;
    }

    // Count skills
    const skillsDir = path.join(agileflowDir, 'skills');
    if (await fs.pathExists(skillsDir)) {
      const entries = await fs.readdir(skillsDir, { withFileTypes: true });
      counts.skills = entries.filter(e => e.isDirectory()).length;
    }

    return counts;
  }

  /**
   * Copy CHANGELOG.md to .agileflow/ for /agileflow:whats-new command
   * @param {string} agileflowDir - AgileFlow installation directory
   * @param {Object} options - Installation options
   * @param {boolean} options.force - Overwrite existing file
   */
  async installChangelog(agileflowDir, options = {}) {
    const { force = false } = options;
    const changelogSource = path.join(this.packageRoot, 'CHANGELOG.md');
    const changelogDest = path.join(agileflowDir, 'CHANGELOG.md');

    // Skip if source changelog doesn't exist
    if (!(await fs.pathExists(changelogSource))) {
      return;
    }

    const destExists = await fs.pathExists(changelogDest);

    // If destination exists and not forcing, check if identical
    if (destExists && !force) {
      const srcContent = await fs.readFile(changelogSource, 'utf8');
      const destContent = await fs.readFile(changelogDest, 'utf8');
      if (srcContent === destContent) {
        return; // Identical, skip
      }
      // Different content - always update changelog since it's managed by package
    }

    // Copy the changelog
    await fs.copy(changelogSource, changelogDest);
  }

  /**
   * Install all scripts from packages/cli/scripts/ to .agileflow/scripts/
   * Copies everything automatically - no manual list to maintain
   * @param {string} directory - Project directory
   * @param {Object} options - Installation options
   * @param {boolean} options.force - Overwrite existing scripts
   */
  async installScripts(directory, options = {}) {
    const { force = false } = options;
    const scriptsSourceDir = path.join(this.packageRoot, 'scripts');
    const scriptsDestDir = path.join(directory, '.agileflow', 'scripts');

    // Skip if source scripts directory doesn't exist
    if (!(await fs.pathExists(scriptsSourceDir))) {
      return;
    }

    // Ensure destination scripts directory exists
    await fs.ensureDir(scriptsDestDir);

    // Copy all scripts recursively
    await this.copyScriptsRecursive(scriptsSourceDir, scriptsDestDir, force);
  }

  /**
   * Copy lib/ directory to user's project
   * Scripts in .agileflow/scripts/ require ../lib/ for shared utilities
   * @param {string} directory - Project directory
   * @param {Object} options - Installation options
   * @param {boolean} options.force - Overwrite existing files
   */
  async installLib(directory, options = {}) {
    const { force = false } = options;
    const libSourceDir = path.join(this.packageRoot, 'lib');
    const libDestDir = path.join(directory, '.agileflow', 'lib');

    // Skip if source lib directory doesn't exist
    if (!(await fs.pathExists(libSourceDir))) {
      return;
    }

    // Ensure destination lib directory exists
    await fs.ensureDir(libDestDir);

    // Copy all lib files recursively (reuse scripts copy logic)
    await this.copyScriptsRecursive(libSourceDir, libDestDir, force);
  }

  /**
   * Recursively copy scripts from source to destination
   * @param {string} srcDir - Source directory
   * @param {string} destDir - Destination directory
   * @param {boolean} force - Overwrite existing files
   */
  async copyScriptsRecursive(srcDir, destDir, force) {
    const entries = await fs.readdir(srcDir, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(srcDir, entry.name);
      const destPath = path.join(destDir, entry.name);

      if (entry.isDirectory()) {
        // Recursively copy subdirectories
        await fs.ensureDir(destPath);
        await this.copyScriptsRecursive(srcPath, destPath, force);
      } else {
        // Copy file
        const destExists = await fs.pathExists(destPath);

        // If destination exists and not forcing, check if identical
        if (destExists && !force) {
          const srcContent = await fs.readFile(srcPath);
          const destContent = await fs.readFile(destPath);
          if (srcContent.equals(destContent)) {
            continue; // Identical, skip
          }
          // Different content but not forcing, skip to preserve user changes
          continue;
        }

        // Copy the file
        await fs.copy(srcPath, destPath);

        // Make executable on Unix for shell scripts and JS files
        if (process.platform !== 'win32') {
          const ext = path.extname(entry.name).toLowerCase();
          if (['.sh', '.js'].includes(ext)) {
            await fs.chmod(destPath, 0o755);
          }
        }
      }
    }
  }

  /**
   * Get installation status
   * @param {string} directory - Project directory
   * @returns {Promise<Object>} Installation status
   */
  async getStatus(directory) {
    const status = {
      installed: false,
      path: null,
      version: null,
      ides: [],
      modules: [],
      userName: null,
      agileflowFolder: null,
      docsFolder: null,
      installedAt: null,
      updatedAt: null,
    };

    // Look for AgileFlow installation
    const possibleFolders = ['.agileflow', 'agileflow', '.aflow'];

    for (const folder of possibleFolders) {
      const agileflowDir = path.join(directory, folder);
      const manifestPath = path.join(agileflowDir, '_cfg', 'manifest.yaml');

      if (await fs.pathExists(manifestPath)) {
        status.installed = true;
        status.path = agileflowDir;

        const manifestContent = await fs.readFile(manifestPath, 'utf8');
        const manifest = yaml.load(manifestContent);

        status.version = manifest.version;
        status.ides = manifest.ides || [];
        status.modules = manifest.modules || [];
        status.userName = manifest.user_name || 'Developer';
        status.agileflowFolder = manifest.agileflow_folder || folder;
        status.docsFolder = manifest.docs_folder || 'docs';
        status.installedAt = manifest.installed_at;
        status.updatedAt = manifest.updated_at;

        break;
      }
    }

    return status;
  }
}

module.exports = { Installer, getSourcePath, getPackageRoot };
