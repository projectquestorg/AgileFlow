'use strict';

const fs = require('fs');

/**
 * Registry scanning cache
 * Caches directory scan results keyed by path + mtime.
 * TTL-based expiration (default 60s).
 */

const _cache = new Map();
const DEFAULT_TTL_MS = 60 * 1000;

/**
 * Get cached scan result for a directory
 * @param {string} dirPath - Directory path
 * @param {Object} [options]
 * @param {number} [options.ttlMs] - TTL in milliseconds (default 60000)
 * @param {boolean} [options.noCache] - Bypass cache entirely
 * @returns {*|null} Cached result or null if miss/expired
 */
function getCached(dirPath, options = {}) {
  const { ttlMs = DEFAULT_TTL_MS, noCache = false } = options;

  if (noCache) return null;

  const entry = _cache.get(dirPath);
  if (!entry) return null;

  // Check TTL
  if (Date.now() - entry.cachedAt > ttlMs) {
    _cache.delete(dirPath);
    return null;
  }

  // Check directory mtime hasn't changed
  try {
    const stat = fs.statSync(dirPath);
    const currentMtime = stat.mtimeMs;
    if (currentMtime !== entry.mtimeMs) {
      _cache.delete(dirPath);
      return null;
    }
  } catch {
    _cache.delete(dirPath);
    return null;
  }

  return entry.data;
}

/**
 * Store scan result in cache
 * @param {string} dirPath - Directory path
 * @param {*} data - Data to cache
 */
function setCached(dirPath, data) {
  try {
    const stat = fs.statSync(dirPath);
    _cache.set(dirPath, {
      data,
      mtimeMs: stat.mtimeMs,
      cachedAt: Date.now(),
    });
  } catch {
    // Can't stat directory, don't cache
  }
}

/**
 * Clear all cached entries
 */
function clearCache() {
  _cache.clear();
}

/**
 * Get cache stats
 * @returns {{ size: number, keys: string[] }}
 */
function getCacheStats() {
  return {
    size: _cache.size,
    keys: Array.from(_cache.keys()),
  };
}

/**
 * Wrap a scan function with caching
 * @param {Function} scanFn - Function that takes (dirPath, ...args) and returns results
 * @param {Object} [options]
 * @param {number} [options.ttlMs] - TTL in ms
 * @returns {Function} Cached version of scanFn
 */
function withCache(scanFn, options = {}) {
  return function cachedScan(dirPath, ...args) {
    const noCache = process.argv.includes('--no-cache') || options.noCache;
    const cached = getCached(dirPath, { ...options, noCache });
    if (cached !== null) return cached;

    const result = scanFn(dirPath, ...args);
    setCached(dirPath, result);
    return result;
  };
}

module.exports = {
  getCached,
  setCached,
  clearCache,
  getCacheStats,
  withCache,
  DEFAULT_TTL_MS,
};
