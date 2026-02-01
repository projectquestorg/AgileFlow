/**
 * lock-file.js - Lock file operations for session management
 *
 * Manages session lock files for PID-based liveness detection.
 * Lock files use a simple key-value format: pid=12345\nstarted=1706825600
 */

const fs = require('fs');
const path = require('path');

/**
 * Parse lock file content into an object
 * @param {string} content - Raw lock file content
 * @returns {Object} Parsed key-value pairs
 */
function parseLockContent(content) {
  const lock = {};
  content.split('\n').forEach(line => {
    const [key, value] = line.split('=');
    if (key && value) {
      lock[key.trim()] = value.trim();
    }
  });
  return lock;
}

/**
 * Get lock file path for a session
 * @param {string} sessionsDir - Sessions directory path
 * @param {string} sessionId - Session identifier
 * @returns {string} Full path to lock file
 */
function getLockPath(sessionsDir, sessionId) {
  return path.join(sessionsDir, `${sessionId}.lock`);
}

/**
 * Read lock file synchronously
 * @param {string} sessionsDir - Sessions directory path
 * @param {string} sessionId - Session identifier
 * @returns {Object|null} Parsed lock data or null if not found
 */
function readLock(sessionsDir, sessionId) {
  const lockPath = getLockPath(sessionsDir, sessionId);
  if (!fs.existsSync(lockPath)) return null;

  try {
    const content = fs.readFileSync(lockPath, 'utf8');
    return parseLockContent(content);
  } catch (e) {
    return null;
  }
}

/**
 * Read lock file asynchronously
 * @param {string} sessionsDir - Sessions directory path
 * @param {string} sessionId - Session identifier
 * @returns {Promise<Object|null>} Parsed lock data or null if not found
 */
async function readLockAsync(sessionsDir, sessionId) {
  const lockPath = getLockPath(sessionsDir, sessionId);
  try {
    const content = await fs.promises.readFile(lockPath, 'utf8');
    return parseLockContent(content);
  } catch (e) {
    return null;
  }
}

/**
 * Write lock file for a session
 * @param {string} sessionsDir - Sessions directory path
 * @param {string} sessionId - Session identifier
 * @param {number} pid - Process ID to record
 */
function writeLock(sessionsDir, sessionId, pid) {
  const lockPath = getLockPath(sessionsDir, sessionId);
  const content = `pid=${pid}\nstarted=${Math.floor(Date.now() / 1000)}\n`;
  fs.writeFileSync(lockPath, content);
}

/**
 * Remove lock file for a session
 * @param {string} sessionsDir - Sessions directory path
 * @param {string} sessionId - Session identifier
 */
function removeLock(sessionsDir, sessionId) {
  const lockPath = getLockPath(sessionsDir, sessionId);
  if (fs.existsSync(lockPath)) {
    fs.unlinkSync(lockPath);
  }
}

/**
 * Check if a PID is alive
 * @param {number} pid - Process ID to check
 * @returns {boolean} True if process is alive
 */
function isPidAlive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Check if session is active (has lock with alive PID)
 * @param {string} sessionsDir - Sessions directory path
 * @param {string} sessionId - Session identifier
 * @returns {boolean} True if session is active
 */
function isSessionActive(sessionsDir, sessionId) {
  const lock = readLock(sessionsDir, sessionId);
  if (!lock || !lock.pid) return false;
  return isPidAlive(parseInt(lock.pid, 10));
}

/**
 * Check if session is active asynchronously
 * @param {string} sessionsDir - Sessions directory path
 * @param {string} sessionId - Session identifier
 * @returns {Promise<boolean>} True if session is active
 */
async function isSessionActiveAsync(sessionsDir, sessionId) {
  const lock = await readLockAsync(sessionsDir, sessionId);
  if (!lock || !lock.pid) return false;
  return isPidAlive(parseInt(lock.pid, 10));
}

module.exports = {
  parseLockContent,
  getLockPath,
  readLock,
  readLockAsync,
  writeLock,
  removeLock,
  isPidAlive,
  isSessionActive,
  isSessionActiveAsync,
};
