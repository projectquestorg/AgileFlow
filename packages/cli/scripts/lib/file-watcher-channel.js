/**
 * file-watcher-channel.js - File System Watcher Channel (EP-0049, US-0439)
 *
 * Watches a directory for file changes and streams them as channel events
 * to the AgileFlow JSONL message bus.
 *
 * Uses Node.js fs.watch() for cross-platform file system watching.
 * Includes debouncing to prevent event floods from rapid file changes.
 *
 * Usage:
 *   const { setupFileWatcherChannel, createFileWatcher } = require('./lib/file-watcher-channel');
 *
 *   // One-time setup (registers channel)
 *   setupFileWatcherChannel(rootDir, '/path/to/watch');
 *
 *   // Start watching (returns watcher handle)
 *   const watcher = createFileWatcher(rootDir, '/path/to/watch', { debounceMs: 500 });
 *   watcher.close(); // Stop watching
 */

const fs = require('fs');
const path = require('path');

// Lazy-load
let _channelAdapter;
function getChannelAdapter() {
  if (!_channelAdapter) _channelAdapter = require('./channel-adapter');
  return _channelAdapter;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Default debounce interval in milliseconds */
const DEFAULT_DEBOUNCE_MS = 500;

/** File patterns to ignore */
const IGNORE_PATTERNS = [
  /node_modules/,
  /\.git\//,
  /\.agileflow\//,
  /\.claude\//,
  /\.DS_Store/,
  /\.swp$/,
  /~$/,
  /\.tmp$/,
];

// ============================================================================
// CORE FUNCTIONS
// ============================================================================

/**
 * Check if a file path should be ignored.
 *
 * @param {string} filePath - File path to check
 * @returns {boolean} True if the file should be ignored
 */
function shouldIgnore(filePath) {
  return IGNORE_PATTERNS.some(pattern => pattern.test(filePath));
}

/**
 * Create a file watcher that emits channel events.
 *
 * @param {string} rootDir - Project root for sending events to bus
 * @param {string} watchDir - Directory to watch
 * @param {object} [options] - Options
 * @param {number} [options.debounceMs] - Debounce interval (default: 500ms)
 * @param {boolean} [options.recursive] - Watch recursively (default: true)
 * @returns {{ close: Function, watchDir: string }} Watcher handle
 */
function createFileWatcher(rootDir, watchDir, options = {}) {
  const debounceMs = options.debounceMs || DEFAULT_DEBOUNCE_MS;
  const recursive = options.recursive !== false;

  const pending = new Map();
  let watcher;

  try {
    watcher = fs.watch(watchDir, { recursive }, (eventType, filename) => {
      if (!filename || shouldIgnore(filename)) return;

      // Debounce: only emit after no changes for debounceMs
      const key = `${eventType}:${filename}`;
      if (pending.has(key)) {
        clearTimeout(pending.get(key));
      }

      pending.set(
        key,
        setTimeout(() => {
          pending.delete(key);

          const adapter = getChannelAdapter();
          adapter.processEvent(rootDir, {
            source: 'file-watcher',
            type: eventType === 'rename' ? 'file_created_or_deleted' : 'file_changed',
            payload: {
              filename,
              eventType,
              watchDir,
            },
            sourceId: `${watchDir}:${filename}:${Date.now()}`,
          });
        }, debounceMs)
      );
    });
  } catch (e) {
    return { close: () => {}, watchDir, error: e.message };
  }

  return {
    close: () => {
      if (watcher) watcher.close();
      for (const timeout of pending.values()) {
        clearTimeout(timeout);
      }
      pending.clear();
    },
    watchDir,
  };
}

/**
 * Set up a file-watcher channel.
 *
 * Registers the channel in the adapter registry.
 * Does NOT start watching — use createFileWatcher() for that.
 *
 * @param {string} rootDir - Project root
 * @param {string} watchDir - Directory to watch
 * @param {object} [options] - Options
 * @param {string} [options.trustLevel] - Trust level (default: 'observe')
 * @param {string} [options.name] - Channel name (default: 'file-watcher')
 * @returns {{ ok: boolean, error?: string }}
 */
function setupFileWatcherChannel(rootDir, watchDir, options = {}) {
  const name = options.name || 'file-watcher';
  const trustLevel = options.trustLevel || 'observe';

  // Validate watch directory
  if (!watchDir) {
    return { ok: false, error: 'watchDir is required' };
  }

  const resolvedDir = path.resolve(rootDir, watchDir);
  if (!fs.existsSync(resolvedDir)) {
    return { ok: false, error: `Directory does not exist: ${resolvedDir}` };
  }

  if (!fs.statSync(resolvedDir).isDirectory()) {
    return { ok: false, error: `Not a directory: ${resolvedDir}` };
  }

  const adapter = getChannelAdapter();
  return adapter.registerChannel(rootDir, name, {
    source: 'file-watcher',
    trustLevel,
    watchDir: resolvedDir,
  });
}

module.exports = {
  shouldIgnore,
  createFileWatcher,
  setupFileWatcherChannel,
  DEFAULT_DEBOUNCE_MS,
  IGNORE_PATTERNS,
};
