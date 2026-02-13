'use strict';

const { MtimeCache } = require('./cache-provider');

/**
 * Registry scanning cache
 * Caches directory scan results keyed by path + mtime.
 * TTL-based expiration (default 60s).
 *
 * Uses MtimeCache from cache-provider for unified caching with
 * automatic mtime invalidation.
 */

const DEFAULT_TTL_MS = 60 * 1000;

const _cache = new MtimeCache({ maxSize: 50, ttlMs: DEFAULT_TTL_MS });

/**
 * Get cached scan result for a directory
 * @param {string} dirPath - Directory path
 * @param {Object} [options]
 * @param {boolean} [options.noCache] - Bypass cache entirely
 * @returns {*|null} Cached result or null if miss/expired
 */
function getCached(dirPath, options = {}) {
  if (options.noCache) return null;
  return _cache.get(dirPath) ?? null;
}

/**
 * Store scan result in cache
 * @param {string} dirPath - Directory path
 * @param {*} data - Data to cache
 */
function setCached(dirPath, data) {
  _cache.set(dirPath, data);
}

/**
 * Clear all cached entries
 */
function clearCache() {
  _cache.clear();
}

/**
 * Get cache stats
 * @returns {{ size: number, hits: number, misses: number, hitRate: string }}
 */
function getCacheStats() {
  return _cache.getStats();
}

/**
 * Wrap a scan function with caching
 * @param {Function} scanFn - Function that takes (dirPath, ...args) and returns results
 * @param {Object} [options]
 * @param {boolean} [options.noCache] - Bypass cache
 * @returns {Function} Cached version of scanFn
 */
function withCache(scanFn, options = {}) {
  return function cachedScan(dirPath, ...args) {
    const noCache = process.argv.includes('--no-cache') || options.noCache;
    const cached = getCached(dirPath, { noCache });
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
