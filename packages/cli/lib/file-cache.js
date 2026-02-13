/**
 * File Cache - LRU Cache for frequently read JSON files
 *
 * Optimizes performance by caching frequently accessed JSON files
 * with configurable TTL (Time To Live).
 *
 * Features:
 * - LRU (Least Recently Used) eviction when max size reached
 * - TTL-based automatic expiration
 * - Separate caches for different data types
 * - Thread-safe for single-process Node.js usage
 */

const fs = require('fs');
const path = require('path');

/**
 * LRU Cache implementation with TTL support
 */
class LRUCache {
  /**
   * Create a new LRU Cache
   * @param {Object} options
   * @param {number} [options.maxSize=100] - Maximum number of entries
   * @param {number} [options.ttlMs=30000] - Time to live in milliseconds (default 30s)
   */
  constructor(options = {}) {
    this.maxSize = options.maxSize || 100;
    this.ttlMs = options.ttlMs || 30000;
    this.cache = new Map();
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
    };
  }

  /**
   * Get a value from cache
   * @param {string} key - Cache key
   * @returns {*} Cached value or undefined if not found/expired
   */
  get(key) {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check if expired
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set a value in cache
   * @param {string} key - Cache key
   * @param {*} value - Value to cache
   * @param {number} [ttlMs] - Optional custom TTL for this entry
   */
  set(key, value, ttlMs = this.ttlMs) {
    // Remove existing entry if present
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // Evict oldest entries if at capacity
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      this.cache.delete(oldestKey);
      this.stats.evictions++;
    }

    // Add new entry
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttlMs,
      cachedAt: Date.now(),
    });
  }

  /**
   * Check if key exists and is not expired
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }

  /**
   * Remove a key from cache
   * @param {string} key - Cache key
   * @returns {boolean} True if key was removed
   */
  delete(key) {
    return this.cache.delete(key);
  }

  /**
   * Clear all entries
   */
  clear() {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Stats object
   */
  getStats() {
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate:
        this.stats.hits + this.stats.misses > 0
          ? ((this.stats.hits / (this.stats.hits + this.stats.misses)) * 100).toFixed(1) + '%'
          : '0%',
    };
  }

  /**
   * Get number of entries in cache
   * @returns {number}
   */
  get size() {
    return this.cache.size;
  }
}

// =============================================================================
// File Cache Singleton
// =============================================================================

// Global cache instance (persists across requires in same process)
const fileCache = new LRUCache({
  maxSize: 50,
  ttlMs: 15000, // 15 seconds
});

/**
 * Read and cache a JSON file
 * @param {string} filePath - Absolute path to JSON file
 * @param {Object} [options]
 * @param {boolean} [options.force=false] - Skip cache and force read
 * @param {number} [options.ttlMs] - Custom TTL for this file
 * @returns {Object|null} Parsed JSON or null if error
 */
function readJSONCached(filePath, options = {}) {
  const { force = false, ttlMs } = options;
  const cacheKey = `json:${filePath}`;

  // Check cache first (unless force reload)
  if (!force) {
    const cached = fileCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
  }

  // Read from disk
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(content);

    // Cache the result
    fileCache.set(cacheKey, data, ttlMs);

    return data;
  } catch (error) {
    // Cache null to avoid repeated failed reads
    fileCache.set(cacheKey, null, 5000); // 5s TTL for errors
    return null;
  }
}

/**
 * Read and cache a text file
 * @param {string} filePath - Absolute path to file
 * @param {Object} [options]
 * @param {boolean} [options.force=false] - Skip cache and force read
 * @param {number} [options.ttlMs] - Custom TTL for this file
 * @returns {string|null} File content or null if error
 */
function readFileCached(filePath, options = {}) {
  const { force = false, ttlMs } = options;
  const cacheKey = `file:${filePath}`;

  // Check cache first (unless force reload)
  if (!force) {
    const cached = fileCache.get(cacheKey);
    if (cached !== undefined) {
      return cached;
    }
  }

  // Read from disk
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }
    const content = fs.readFileSync(filePath, 'utf8');

    // Cache the result
    fileCache.set(cacheKey, content, ttlMs);

    return content;
  } catch (error) {
    // Cache null to avoid repeated failed reads
    fileCache.set(cacheKey, null, 5000); // 5s TTL for errors
    return null;
  }
}

/**
 * Invalidate cache for a specific file
 * Call this after writing to a cached file
 * @param {string} filePath - Absolute path to file
 */
function invalidate(filePath) {
  fileCache.delete(`json:${filePath}`);
  fileCache.delete(`file:${filePath}`);
}

/**
 * Invalidate cache for all files in a directory
 * @param {string} dirPath - Directory path
 */
function invalidateDir(dirPath) {
  const normalizedDir = path.normalize(dirPath);
  for (const key of fileCache.cache.keys()) {
    const keyPath = key.replace(/^(json|file):/, '');
    if (keyPath.startsWith(normalizedDir)) {
      fileCache.delete(key);
    }
  }
}

/**
 * Clear entire cache
 */
function clearCache() {
  fileCache.clear();
}

/**
 * Get cache statistics
 * @returns {Object} Cache stats
 */
function getCacheStats() {
  return fileCache.getStats();
}

// =============================================================================
// Convenience Methods for Common Files
// =============================================================================

/**
 * Read status.json with caching
 * @param {string} rootDir - Project root directory
 * @param {Object} [options]
 * @returns {Object|null}
 */
function readStatus(rootDir, options = {}) {
  const filePath = path.join(rootDir, 'docs', '09-agents', 'status.json');
  return readJSONCached(filePath, options);
}

/**
 * Read session-state.json with caching
 * @param {string} rootDir - Project root directory
 * @param {Object} [options]
 * @returns {Object|null}
 */
function readSessionState(rootDir, options = {}) {
  const filePath = path.join(rootDir, 'docs', '09-agents', 'session-state.json');
  return readJSONCached(filePath, options);
}

/**
 * Read agileflow-metadata.json with caching
 * @param {string} rootDir - Project root directory
 * @param {Object} [options]
 * @returns {Object|null}
 */
function readMetadata(rootDir, options = {}) {
  const filePath = path.join(rootDir, 'docs', '00-meta', 'agileflow-metadata.json');
  return readJSONCached(filePath, options);
}

/**
 * Read registry.json with caching
 * @param {string} rootDir - Project root directory
 * @param {Object} [options]
 * @returns {Object|null}
 */
function readRegistry(rootDir, options = {}) {
  const filePath = path.join(rootDir, '.agileflow', 'sessions', 'registry.json');
  return readJSONCached(filePath, options);
}

/**
 * Batch read multiple common files
 * More efficient than reading each individually
 * @param {string} rootDir - Project root directory
 * @param {Object} [options]
 * @returns {Object} Object with status, sessionState, metadata, registry
 */
function readProjectFiles(rootDir, options = {}) {
  return {
    status: readStatus(rootDir, options),
    sessionState: readSessionState(rootDir, options),
    metadata: readMetadata(rootDir, options),
    registry: readRegistry(rootDir, options),
  };
}

// =============================================================================
// Command Caching (for git and other shell commands)
// =============================================================================

const { execFileSync } = require('child_process');

// Separate cache for command output with shorter TTL
const commandCache = new LRUCache({
  maxSize: 50,
  ttlMs: 30000, // 30 seconds default
});

/**
 * Execute and cache a shell command
 * @param {string} command - Shell command to execute
 * @param {Object} [options]
 * @param {string} [options.cwd] - Working directory
 * @param {boolean} [options.force=false] - Skip cache and force execution
 * @param {number} [options.ttlMs] - Custom TTL for this command
 * @param {string} [options.cacheKey] - Custom cache key (default: auto-generated)
 * @returns {{ ok: boolean, data?: string, error?: string, cached?: boolean }}
 */
function execCached(command, options = {}) {
  const { cwd = process.cwd(), force = false, ttlMs, cacheKey } = options;
  const key = cacheKey || `cmd:${command}:${cwd}`;

  // Check cache first (unless force)
  if (!force) {
    const cached = commandCache.get(key);
    if (cached !== undefined) {
      return { ok: true, data: cached, cached: true };
    }
  }

  // Execute command
  try {
    const output = execFileSync('bash', ['-c', command], {
      cwd,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 10000, // 10 second timeout
    }).trim();

    // Cache the result
    commandCache.set(key, output, ttlMs);

    return { ok: true, data: output, cached: false };
  } catch (error) {
    // Cache errors briefly to avoid repeated failures
    const errMsg = error.message || 'Command failed';
    return { ok: false, error: errMsg, cached: false };
  }
}

/**
 * Execute and cache a git command
 * Helper with git-specific cache key format
 * @param {string} gitCommand - Git subcommand (e.g., 'status --short')
 * @param {Object} [options]
 * @param {string} [options.cwd] - Working directory
 * @param {boolean} [options.force=false] - Skip cache
 * @param {number} [options.ttlMs=30000] - TTL (default 30s)
 * @returns {{ ok: boolean, data?: string, error?: string, cached?: boolean }}
 */
function gitCached(gitCommand, options = {}) {
  const { cwd = process.cwd(), ttlMs = 30000, force = false } = options;
  const command = `git ${gitCommand}`;
  const cacheKey = `git:${gitCommand}:${cwd}`;

  return execCached(command, {
    cwd,
    force,
    ttlMs,
    cacheKey,
  });
}

/**
 * Common git commands with caching
 */
const gitCommands = {
  /**
   * Get current branch name (cached)
   * @param {string} [cwd] - Working directory
   * @param {Object} [options]
   * @returns {{ ok: boolean, data?: string, cached?: boolean }}
   */
  branch(cwd, options = {}) {
    return gitCached('branch --show-current', { cwd, ...options });
  },

  /**
   * Get short status (cached)
   * @param {string} [cwd] - Working directory
   * @param {Object} [options]
   * @returns {{ ok: boolean, data?: string, cached?: boolean }}
   */
  status(cwd, options = {}) {
    return gitCached('status --short', { cwd, ...options });
  },

  /**
   * Get recent commits (cached)
   * @param {string} [cwd] - Working directory
   * @param {Object} [options]
   * @param {number} [options.count=5] - Number of commits
   * @returns {{ ok: boolean, data?: string, cached?: boolean }}
   */
  log(cwd, options = {}) {
    const { count = 5, ...rest } = options;
    return gitCached(`log -${count} --oneline`, { cwd, ...rest });
  },

  /**
   * Get diff summary (cached with shorter TTL)
   * @param {string} [cwd] - Working directory
   * @param {Object} [options]
   * @returns {{ ok: boolean, data?: string, cached?: boolean }}
   */
  diff(cwd, options = {}) {
    return gitCached('diff --stat', { cwd, ttlMs: 15000, ...options });
  },

  /**
   * Get last commit short hash (cached)
   * @param {string} [cwd] - Working directory
   * @param {Object} [options]
   * @returns {{ ok: boolean, data?: string, cached?: boolean }}
   */
  commitHash(cwd, options = {}) {
    return gitCached('log -1 --format="%h"', { cwd, ...options });
  },

  /**
   * Get last commit message (cached)
   * @param {string} [cwd] - Working directory
   * @param {Object} [options]
   * @returns {{ ok: boolean, data?: string, cached?: boolean }}
   */
  commitMessage(cwd, options = {}) {
    return gitCached('log -1 --format="%s"', { cwd, ...options });
  },
};

/**
 * Invalidate all git caches for a directory
 * Call this after git operations that modify state
 * @param {string} [cwd] - Working directory
 */
function invalidateGitCache(cwd = process.cwd()) {
  const prefix = `git:`;
  const suffix = `:${cwd}`;
  for (const key of commandCache.cache.keys()) {
    if (key.startsWith(prefix) && key.endsWith(suffix)) {
      commandCache.delete(key);
    }
  }
}

/**
 * Get command cache statistics
 * @returns {Object} Cache stats
 */
function getCommandCacheStats() {
  return commandCache.getStats();
}

/**
 * Clear command cache
 */
function clearCommandCache() {
  commandCache.clear();
}

module.exports = {
  // Core LRU Cache class (for custom usage)
  LRUCache,

  // File reading with caching
  readJSONCached,
  readFileCached,

  // Cache management
  invalidate,
  invalidateDir,
  clearCache,
  getCacheStats,

  // Convenience methods for common files
  readStatus,
  readSessionState,
  readMetadata,
  readRegistry,
  readProjectFiles,

  // Command caching
  execCached,
  gitCached,
  gitCommands,
  invalidateGitCache,
  getCommandCacheStats,
  clearCommandCache,
};
