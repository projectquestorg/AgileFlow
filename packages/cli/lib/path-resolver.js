/**
 * path-resolver.js - Unified Path Resolution Service
 *
 * Provides centralized path resolution that respects user configuration.
 * Loads folder names from manifest.yaml and provides consistent path
 * resolution across all AgileFlow scripts and commands.
 *
 * Features:
 * - Loads folder names from manifest.yaml
 * - Caches configuration for performance
 * - Validates paths before shell execution
 * - Provides consistent API for all path operations
 *
 * Usage:
 *   const PathResolver = require('./path-resolver');
 *   const resolver = new PathResolver('/path/to/project');
 *
 *   // Get paths
 *   const agileflowDir = resolver.getAgileflowDir();
 *   const docsDir = resolver.getDocsDir();
 *   const statusPath = resolver.getStatusPath();
 *
 *   // Get all paths at once
 *   const paths = resolver.getAllPaths();
 */

const fs = require('fs');
const path = require('path');
const { safeLoad } = require('./yaml-utils');
const { validatePath } = require('./validate');

/**
 * Unified Path Resolution Service
 */
class PathResolver {
  /**
   * @param {string} [projectRoot] - Project root directory (auto-detected if not provided)
   * @param {Object} [options={}] - Configuration options
   * @param {boolean} [options.autoDetect=true] - Auto-detect project root if not found
   * @param {string} [options.agileflowFolder='.agileflow'] - Default agileflow folder name
   * @param {string} [options.docsFolder='docs'] - Default docs folder name
   */
  constructor(projectRoot, options = {}) {
    const { autoDetect = true, agileflowFolder = '.agileflow', docsFolder = 'docs' } = options;

    // Store defaults
    this._defaultAgileflowFolder = agileflowFolder;
    this._defaultDocsFolder = docsFolder;

    // Find project root
    if (projectRoot) {
      this._projectRoot = projectRoot;
    } else if (autoDetect) {
      this._projectRoot = this._findProjectRoot(process.cwd());
    } else {
      this._projectRoot = process.cwd();
    }

    // Cache for manifest data
    this._manifestCache = null;
    this._manifestCacheTime = 0;
    this._cacheMaxAge = 5000; // 5 second cache
  }

  /**
   * Find project root by looking for common project markers
   * @param {string} startDir - Directory to start searching from
   * @returns {string} Project root path
   * @private
   */
  _findProjectRoot(startDir) {
    const markers = ['.agileflow', 'agileflow', '.aflow', '.git', 'package.json'];
    let dir = startDir;

    while (dir !== path.dirname(dir)) {
      for (const marker of markers) {
        if (fs.existsSync(path.join(dir, marker))) {
          // If we found .agileflow, that's definitely our root
          if (['.agileflow', 'agileflow', '.aflow'].includes(marker)) {
            return dir;
          }
          // For .git and package.json, only use if no agileflow dir found above
          if (!this._hasAgileflowAbove(dir)) {
            return dir;
          }
        }
      }
      dir = path.dirname(dir);
    }

    return startDir;
  }

  /**
   * Check if any agileflow directory exists above this directory
   * @param {string} dir - Directory to check from
   * @returns {boolean}
   * @private
   */
  _hasAgileflowAbove(dir) {
    let current = path.dirname(dir);
    while (current !== path.dirname(current)) {
      if (
        fs.existsSync(path.join(current, '.agileflow')) ||
        fs.existsSync(path.join(current, 'agileflow')) ||
        fs.existsSync(path.join(current, '.aflow'))
      ) {
        return true;
      }
      current = path.dirname(current);
    }
    return false;
  }

  /**
   * Load manifest configuration with caching
   * @returns {{agileflowFolder: string, docsFolder: string}}
   * @private
   */
  _loadManifest() {
    const now = Date.now();

    // Return cached if still valid
    if (this._manifestCache && now - this._manifestCacheTime < this._cacheMaxAge) {
      return this._manifestCache;
    }

    // Find the agileflow directory
    const possibleFolders = ['.agileflow', 'agileflow', '.aflow'];
    let manifestPath = null;

    for (const folder of possibleFolders) {
      const candidate = path.join(this._projectRoot, folder, '_cfg', 'manifest.yaml');
      if (fs.existsSync(candidate)) {
        manifestPath = candidate;
        this._actualAgileflowFolder = folder;
        break;
      }
    }

    // Default values
    const result = {
      agileflowFolder: this._actualAgileflowFolder || this._defaultAgileflowFolder,
      docsFolder: this._defaultDocsFolder,
    };

    if (manifestPath) {
      try {
        const content = fs.readFileSync(manifestPath, 'utf8');
        const manifest = safeLoad(content);

        if (manifest && typeof manifest === 'object') {
          result.agileflowFolder = manifest.agileflow_folder || result.agileflowFolder;
          result.docsFolder = manifest.docs_folder || result.docsFolder;
        }
      } catch {
        // Use defaults on error
      }
    }

    // Cache the result
    this._manifestCache = result;
    this._manifestCacheTime = now;

    return result;
  }

  /**
   * Get the project root directory
   * @returns {string}
   */
  getProjectRoot() {
    return this._projectRoot;
  }

  /**
   * Get the AgileFlow directory path
   * @returns {string}
   */
  getAgileflowDir() {
    const { agileflowFolder } = this._loadManifest();
    return path.join(this._projectRoot, agileflowFolder);
  }

  /**
   * Get the docs directory path
   * @returns {string}
   */
  getDocsDir() {
    const { docsFolder } = this._loadManifest();
    return path.join(this._projectRoot, docsFolder);
  }

  /**
   * Get the .claude directory path
   * @returns {string}
   */
  getClaudeDir() {
    return path.join(this._projectRoot, '.claude');
  }

  /**
   * Get the status.json path
   * @returns {string}
   */
  getStatusPath() {
    return path.join(this.getDocsDir(), '09-agents', 'status.json');
  }

  /**
   * Get the session-state.json path
   * @returns {string}
   */
  getSessionStatePath() {
    return path.join(this.getDocsDir(), '09-agents', 'session-state.json');
  }

  /**
   * Get the agileflow-metadata.json path
   * @returns {string}
   */
  getMetadataPath() {
    return path.join(this.getDocsDir(), '00-meta', 'agileflow-metadata.json');
  }

  /**
   * Get the config.yaml path
   * @returns {string}
   */
  getConfigPath() {
    return path.join(this.getAgileflowDir(), 'config.yaml');
  }

  /**
   * Get the manifest.yaml path
   * @returns {string}
   */
  getManifestPath() {
    return path.join(this.getAgileflowDir(), '_cfg', 'manifest.yaml');
  }

  /**
   * Get the scripts directory path
   * @returns {string}
   */
  getScriptsDir() {
    return path.join(this.getAgileflowDir(), 'scripts');
  }

  /**
   * Get the commands directory path
   * @returns {string}
   */
  getCommandsDir() {
    return path.join(this.getAgileflowDir(), 'commands');
  }

  /**
   * Get the agents directory path
   * @returns {string}
   */
  getAgentsDir() {
    return path.join(this.getAgileflowDir(), 'agents');
  }

  /**
   * Get all paths at once
   * @returns {Object} Object with all path values
   */
  getAllPaths() {
    return {
      projectRoot: this.getProjectRoot(),
      agileflowDir: this.getAgileflowDir(),
      docsDir: this.getDocsDir(),
      claudeDir: this.getClaudeDir(),
      statusPath: this.getStatusPath(),
      sessionStatePath: this.getSessionStatePath(),
      metadataPath: this.getMetadataPath(),
      configPath: this.getConfigPath(),
      manifestPath: this.getManifestPath(),
      scriptsDir: this.getScriptsDir(),
      commandsDir: this.getCommandsDir(),
      agentsDir: this.getAgentsDir(),
    };
  }

  /**
   * Check if we're in an AgileFlow project
   * @returns {boolean}
   */
  isAgileflowProject() {
    return fs.existsSync(this.getAgileflowDir());
  }

  /**
   * Validate a path is within the project root (prevents path traversal)
   * @param {string} targetPath - Path to validate
   * @returns {{ok: boolean, resolvedPath?: string, error?: Error}}
   */
  validatePath(targetPath) {
    return validatePath(targetPath, this._projectRoot, { allowSymlinks: false });
  }

  /**
   * Resolve a relative path within the project
   * @param {...string} segments - Path segments to join
   * @returns {string} Resolved absolute path
   */
  resolve(...segments) {
    return path.join(this._projectRoot, ...segments);
  }

  /**
   * Get a path relative to project root
   * @param {string} absolutePath - Absolute path
   * @returns {string} Relative path
   */
  relative(absolutePath) {
    return path.relative(this._projectRoot, absolutePath);
  }

  /**
   * Clear the manifest cache (useful for testing or after config changes)
   */
  clearCache() {
    this._manifestCache = null;
    this._manifestCacheTime = 0;
  }

  /**
   * Get the folder names from configuration
   * @returns {{agileflowFolder: string, docsFolder: string}}
   */
  getFolderNames() {
    return this._loadManifest();
  }
}

/**
 * Singleton instance for convenience
 * Uses auto-detection for project root
 */
let defaultInstance = null;

/**
 * Get the default PathResolver instance (singleton)
 * @param {boolean} [forceNew=false] - Force creation of new instance
 * @returns {PathResolver}
 */
function getDefaultResolver(forceNew = false) {
  if (!defaultInstance || forceNew) {
    defaultInstance = new PathResolver();
  }
  return defaultInstance;
}

/**
 * Convenience function to get all paths using default resolver
 * @returns {Object}
 */
function getAllPaths() {
  return getDefaultResolver().getAllPaths();
}

/**
 * Convenience function to get project root using default resolver
 * @returns {string}
 */
function getProjectRoot() {
  return getDefaultResolver().getProjectRoot();
}

/**
 * Convenience function to get agileflow dir using default resolver
 * @returns {string}
 */
function getAgileflowDir() {
  return getDefaultResolver().getAgileflowDir();
}

/**
 * Convenience function to get docs dir using default resolver
 * @returns {string}
 */
function getDocsDir() {
  return getDefaultResolver().getDocsDir();
}

module.exports = {
  PathResolver,
  getDefaultResolver,
  getAllPaths,
  getProjectRoot,
  getAgileflowDir,
  getDocsDir,
};
