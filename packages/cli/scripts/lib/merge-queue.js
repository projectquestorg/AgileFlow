/**
 * merge-queue.js - Sequential merge queue for multi-session safety
 *
 * Prevents race conditions when multiple sessions complete simultaneously
 * and attempt to merge to main. Uses file-lock-based sequential processing.
 *
 * FAIL-OPEN SEMANTICS:
 * ====================
 * If the queue cannot be acquired or is corrupted, merges proceed directly
 * (bypassing the queue) rather than blocking the user.
 *
 * FEATURE FLAG:
 * =============
 * Controlled by features.mergeQueue.enabled in agileflow-metadata.json.
 * When disabled, wrapMerge() passes through to the underlying merge function.
 *
 * USAGE:
 * ======
 * const { wrapMerge, getQueueStatus } = require('./merge-queue');
 *
 * // Wrap any merge function with queue serialization
 * const result = wrapMerge(sessionId, options, (id, opts) => {
 *   return integrateSession(id, opts, loadRegistry, saveRegistry, removeLock);
 * });
 *
 * // Check queue status
 * const status = getQueueStatus();
 *
 * NO EXTERNAL DEPENDENCIES - only Node.js built-ins + file-lock.js
 */

const fs = require('fs');
const path = require('path');

// Lazy-loaded dependencies
let _fileLock;
function getFileLock() {
  if (!_fileLock) {
    _fileLock = require('./file-lock');
  }
  return _fileLock;
}

let _paths;
function getPaths() {
  if (!_paths) {
    try {
      _paths = require('../lib/paths');
    } catch (e) {
      _paths = require('../../lib/paths');
    }
  }
  return _paths;
}

// Queue file location
const QUEUE_FILENAME = 'merge-queue.json';

// Lock timeout for queue operations (longer than file-lock default)
const QUEUE_LOCK_TIMEOUT_MS = 30000;

// Maximum time a merge can hold the queue (10 minutes)
const MAX_MERGE_HOLD_MS = 600000;

// Maximum queue size before pruning stale entries
const MAX_QUEUE_SIZE = 50;

/**
 * Get the path to the merge queue file
 * @returns {string} Queue file path
 */
function getQueuePath() {
  try {
    const { getProjectRoot, getAgileflowDir } = getPaths();
    const root = getProjectRoot();
    const sessionsDir = path.join(getAgileflowDir(root), 'sessions');
    return path.join(sessionsDir, QUEUE_FILENAME);
  } catch (e) {
    // Fallback for testing or when paths module isn't available
    return path.join(process.cwd(), '.agileflow', 'sessions', QUEUE_FILENAME);
  }
}

/**
 * Check if the merge queue feature is enabled
 * @returns {boolean} True if merge queue is enabled
 */
function isEnabled() {
  try {
    const { getProjectRoot } = getPaths();
    const root = getProjectRoot();
    const metadataPath = path.join(root, 'docs', '00-meta', 'agileflow-metadata.json');

    if (!fs.existsSync(metadataPath)) {
      return false;
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    return !!(
      metadata.features &&
      metadata.features.mergeQueue &&
      metadata.features.mergeQueue.enabled
    );
  } catch (e) {
    return false;
  }
}

/**
 * Load the queue state from disk
 * @returns {object} Queue state { entries: [], processing: null }
 */
function loadQueue() {
  const queuePath = getQueuePath();

  try {
    if (fs.existsSync(queuePath)) {
      const data = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
      return {
        entries: Array.isArray(data.entries) ? data.entries : [],
        processing: data.processing || null,
        lastUpdated: data.lastUpdated || null,
      };
    }
  } catch (e) {
    // Corrupted queue - start fresh
  }

  return { entries: [], processing: null, lastUpdated: null };
}

/**
 * Save the queue state to disk atomically
 * @param {object} queue - Queue state to save
 * @returns {boolean} True if saved successfully
 */
function saveQueue(queue) {
  const queuePath = getQueuePath();

  try {
    const dir = path.dirname(queuePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const { atomicWriteJSON } = getFileLock();
    const result = atomicWriteJSON(
      queuePath,
      {
        ...queue,
        lastUpdated: new Date().toISOString(),
      },
      { force: true }
    );

    return result.success;
  } catch (e) {
    return false;
  }
}

/**
 * Remove stale entries from the queue
 * Entries are considered stale if they've been processing for too long
 * or if their PID is no longer alive
 *
 * @param {object} queue - Queue state
 * @returns {object} Cleaned queue state
 */
function pruneStaleEntries(queue) {
  const now = Date.now();
  const { _isPidAlive } = getFileLock();

  // Check if current processing entry is stale
  if (queue.processing) {
    const processingAge = now - new Date(queue.processing.startedAt).getTime();
    const pid = queue.processing.pid;

    if (processingAge > MAX_MERGE_HOLD_MS || (pid && !_isPidAlive(pid))) {
      queue.processing = null;
    }
  }

  // Remove stale queued entries (older than MAX_MERGE_HOLD_MS)
  queue.entries = queue.entries.filter(entry => {
    const age = now - new Date(entry.enqueuedAt).getTime();
    return age < MAX_MERGE_HOLD_MS;
  });

  // Trim to max size
  if (queue.entries.length > MAX_QUEUE_SIZE) {
    queue.entries = queue.entries.slice(-MAX_QUEUE_SIZE);
  }

  return queue;
}

/**
 * Add a merge request to the queue
 *
 * @param {string} sessionId - Session to merge
 * @param {object} [options={}] - Merge options
 * @returns {{ queued: boolean, position: number, error?: string }}
 */
function enqueue(sessionId, options = {}) {
  let lock;

  try {
    const queuePath = getQueuePath();
    const { acquireLock, releaseLock } = getFileLock();

    lock = acquireLock(queuePath, QUEUE_LOCK_TIMEOUT_MS);

    let queue = loadQueue();
    queue = pruneStaleEntries(queue);

    // Check if this session is already in the queue
    const existing = queue.entries.findIndex(e => e.sessionId === sessionId);
    if (existing !== -1) {
      return { queued: true, position: existing + 1, alreadyQueued: true };
    }

    // Check if this session is currently being processed
    if (queue.processing && queue.processing.sessionId === sessionId) {
      return { queued: true, position: 0, isProcessing: true };
    }

    const entry = {
      sessionId,
      options,
      enqueuedAt: new Date().toISOString(),
      pid: process.pid,
    };

    queue.entries.push(entry);
    saveQueue(queue);

    return { queued: true, position: queue.entries.length };
  } catch (e) {
    return { queued: false, position: -1, error: e.message };
  } finally {
    if (lock && lock.acquired) {
      const { releaseLock } = getFileLock();
      releaseLock(lock.lockPath);
    }
  }
}

/**
 * Dequeue the next merge request for processing
 * Marks it as "processing" so other queue consumers skip it
 *
 * @returns {{ entry: object|null, empty: boolean }}
 */
function dequeue() {
  let lock;

  try {
    const queuePath = getQueuePath();
    const { acquireLock } = getFileLock();

    lock = acquireLock(queuePath, QUEUE_LOCK_TIMEOUT_MS);

    let queue = loadQueue();
    queue = pruneStaleEntries(queue);

    // If something is already processing, don't dequeue
    if (queue.processing) {
      return { entry: null, empty: false, busy: true };
    }

    if (queue.entries.length === 0) {
      return { entry: null, empty: true };
    }

    // Take the first entry
    const entry = queue.entries.shift();
    queue.processing = {
      ...entry,
      startedAt: new Date().toISOString(),
      pid: process.pid,
    };

    saveQueue(queue);

    return { entry, empty: false };
  } catch (e) {
    return { entry: null, empty: true, error: e.message };
  } finally {
    if (lock && lock.acquired) {
      const { releaseLock } = getFileLock();
      releaseLock(lock.lockPath);
    }
  }
}

/**
 * Mark the current processing entry as complete
 *
 * @param {object} [result={}] - Merge result to record
 * @returns {boolean} True if marked successfully
 */
function markComplete(result = {}) {
  let lock;

  try {
    const queuePath = getQueuePath();
    const { acquireLock } = getFileLock();

    lock = acquireLock(queuePath, QUEUE_LOCK_TIMEOUT_MS);

    const queue = loadQueue();
    queue.processing = null;
    saveQueue(queue);
    return true;
  } catch (e) {
    return false;
  } finally {
    if (lock && lock.acquired) {
      const { releaseLock } = getFileLock();
      releaseLock(lock.lockPath);
    }
  }
}

/**
 * Get the current queue status
 *
 * @returns {object} Queue status
 */
function getQueueStatus() {
  try {
    let queue = loadQueue();
    const beforeEntries = queue.entries.length;
    const beforeProcessing = queue.processing;
    queue = pruneStaleEntries(queue);

    // Persist pruned state if entries were removed
    if (queue.entries.length < beforeEntries || queue.processing !== beforeProcessing) {
      saveQueue(queue);
    }

    return {
      enabled: isEnabled(),
      queueLength: queue.entries.length,
      isProcessing: !!queue.processing,
      processing: queue.processing
        ? {
            sessionId: queue.processing.sessionId,
            startedAt: queue.processing.startedAt,
          }
        : null,
      entries: queue.entries.map(e => ({
        sessionId: e.sessionId,
        enqueuedAt: e.enqueuedAt,
      })),
      lastUpdated: queue.lastUpdated,
    };
  } catch (e) {
    return {
      enabled: isEnabled(),
      queueLength: 0,
      isProcessing: false,
      processing: null,
      entries: [],
      lastUpdated: null,
      error: e.message,
    };
  }
}

/**
 * Wrap a merge function with queue serialization
 *
 * When the merge queue is enabled, this:
 * 1. Enqueues the merge request
 * 2. Waits for its turn (dequeue)
 * 3. Executes the merge function
 * 4. Marks complete
 * 5. Logs to merge history
 *
 * When disabled, passes through to the merge function directly.
 *
 * @param {string} sessionId - Session to merge
 * @param {object} options - Merge options
 * @param {function} mergeFn - Function (sessionId, options) => result
 * @returns {object} Merge result with queue metadata
 */
function wrapMerge(sessionId, options, mergeFn) {
  // If queue is not enabled, pass through directly
  if (!isEnabled()) {
    const result = mergeFn(sessionId, options);
    // Log to history even when queue is disabled
    logMergeToHistory(sessionId, result);
    return result;
  }

  // Enqueue
  const enqueueResult = enqueue(sessionId, options);
  if (!enqueueResult.queued) {
    // Queue failed - fall through to direct merge (fail-open)
    const result = mergeFn(sessionId, options);
    logMergeToHistory(sessionId, result);
    return { ...result, queueBypassed: true };
  }

  // If we're already processing (re-entrant call), just merge
  if (enqueueResult.isProcessing) {
    const result = mergeFn(sessionId, options);
    markComplete(result);
    logMergeToHistory(sessionId, result);
    return result;
  }

  // Wait for our turn: try to dequeue
  const maxWaitMs = QUEUE_LOCK_TIMEOUT_MS;
  const startTime = Date.now();
  let dequeueResult;

  while (Date.now() - startTime < maxWaitMs) {
    dequeueResult = dequeue();

    if (dequeueResult.entry && dequeueResult.entry.sessionId === sessionId) {
      // It's our turn
      break;
    }

    if (dequeueResult.empty) {
      // Queue is empty but we should be in it - something went wrong
      // Fall through to direct merge (fail-open)
      const result = mergeFn(sessionId, options);
      logMergeToHistory(sessionId, result);
      return { ...result, queueBypassed: true };
    }

    // Not our turn yet - busy-wait briefly
    const now = Date.now();
    while (Date.now() - now < 100) {
      // Brief busy-wait
    }
  }

  // Execute the merge
  try {
    const result = mergeFn(sessionId, options);
    markComplete(result);
    logMergeToHistory(sessionId, result);
    return { ...result, queuePosition: enqueueResult.position };
  } catch (e) {
    markComplete({ success: false, error: e.message });
    throw e;
  }
}

/**
 * Log merge result to JSONL history
 * @param {string} sessionId - Session ID
 * @param {object} result - Merge result
 */
function logMergeToHistory(sessionId, result) {
  try {
    const mergeHistory = require('./merge-history');
    mergeHistory.appendEntry({
      sessionId,
      success: result.success,
      strategy: result.strategy,
      branchName: result.branchName,
      autoResolved: result.autoResolved,
      error: result.error,
    });
  } catch (e) {
    // Fail silently - history logging is not critical
  }
}

module.exports = {
  isEnabled,
  enqueue,
  dequeue,
  markComplete,
  getQueueStatus,
  wrapMerge,
  // For testing
  _loadQueue: loadQueue,
  _saveQueue: saveQueue,
  _pruneStaleEntries: pruneStaleEntries,
  _getQueuePath: getQueuePath,
  _MAX_MERGE_HOLD_MS: MAX_MERGE_HOLD_MS,
};
