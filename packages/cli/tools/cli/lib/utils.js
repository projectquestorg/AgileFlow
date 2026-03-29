/**
 * Shared Utilities Module
 *
 * Common utility functions used across the CLI.
 * Consolidates duplicated code from installer.js, doctor.js, etc.
 */

const crypto = require('crypto');
const path = require('path');

/**
 * Calculate SHA256 hash of data and return as hex string
 * @param {string|Buffer} data - Data to hash
 * @returns {string} Hex-encoded SHA256 hash
 */
function sha256Hex(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Convert a file path to POSIX format (forward slashes)
 * @param {string} filePath - Path to convert
 * @returns {string} POSIX-style path
 */
function toPosixPath(filePath) {
  return filePath.split(path.sep).join('/');
}

/**
 * Generate a safe timestamp string for use in file/folder names
 * @param {Date} date - Date to format (defaults to now)
 * @returns {string} Timestamp like "2025-12-27T10-30-45-123Z"
 */
function safeTimestampForPath(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-');
}

/**
 * Compare two semantic version strings
 * @param {string} v1 - First version (e.g., "2.61.0")
 * @param {string} v2 - Second version (e.g., "2.60.0")
 * @returns {number} -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
function compareVersions(v1, v2) {
  const parts1 = v1.replace(/^v/, '').replace(/-.*$/, '').split('.').map(Number);
  const parts2 = v2.replace(/^v/, '').replace(/-.*$/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 < p2) return -1;
    if (p1 > p2) return 1;
  }
  return 0;
}

/**
 * Create a debug logger function
 * @param {boolean} enabled - Whether debug logging is enabled
 * @param {string} prefix - Optional prefix for log messages
 * @returns {Function} Debug log function
 */
function createDebugLogger(enabled, prefix = '') {
  return (...args) => {
    if (enabled) {
      if (prefix) {
        console.log(`[${prefix}]`, ...args);
      } else {
        console.log(...args);
      }
    }
  };
}

/**
 * Brand color for AgileFlow (burnt orange/terracotta)
 */
const BRAND_COLOR = '#e8683a';

module.exports = {
  sha256Hex,
  toPosixPath,
  safeTimestampForPath,
  compareVersions,
  createDebugLogger,
  BRAND_COLOR,
};
