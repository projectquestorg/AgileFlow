/**
 * Tests for merge-queue.js
 *
 * Tests cover:
 * - isEnabled() - feature flag detection
 * - enqueue() - adding merge requests to queue
 * - dequeue() - taking next request from queue
 * - markComplete() - finishing processing
 * - pruneStaleEntries() - cleaning up dead/stale entries
 * - getQueueStatus() - queue state reporting
 * - wrapMerge() - full merge wrapping with queue serialization
 */

const path = require('path');

// Mock fs before requiring module
jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  appendFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  unlinkSync: jest.fn(),
  openSync: jest.fn(),
  writeSync: jest.fn(),
  closeSync: jest.fn(),
  renameSync: jest.fn(),
  statSync: jest.fn(),
}));

const fs = require('fs');

// Mock file-lock
jest.mock('../../../scripts/lib/file-lock', () => ({
  acquireLock: jest.fn(() => ({ acquired: true, lockPath: '/tmp/test.lock' })),
  releaseLock: jest.fn(() => true),
  atomicWriteJSON: jest.fn(() => ({ success: true })),
  _isPidAlive: jest.fn(() => false),
}));

// Mock paths
jest.mock('../../../lib/paths', () => ({
  getProjectRoot: jest.fn(() => '/test/project'),
  getAgileflowDir: jest.fn(() => '/test/project/.agileflow'),
}));

// Mock merge-history
jest.mock('../../../scripts/lib/merge-history', () => ({
  appendEntry: jest.fn(() => true),
}));

const {
  isEnabled,
  enqueue,
  dequeue,
  markComplete,
  getQueueStatus,
  wrapMerge,
  _loadQueue,
  _pruneStaleEntries,
  _getQueuePath,
  _MAX_MERGE_HOLD_MS,
} = require('../../../scripts/lib/merge-queue');

const fileLock = require('../../../scripts/lib/file-lock');
const mergeHistory = require('../../../scripts/lib/merge-history');

describe('merge-queue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: queue file doesn't exist
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('{}');
    fileLock.acquireLock.mockReturnValue({ acquired: true, lockPath: '/tmp/test.lock' });
    fileLock.releaseLock.mockReturnValue(true);
    fileLock.atomicWriteJSON.mockReturnValue({ success: true });
    fileLock._isPidAlive.mockReturnValue(false);
  });

  describe('_getQueuePath', () => {
    it('returns path within sessions directory', () => {
      const queuePath = _getQueuePath();
      expect(queuePath).toContain('sessions');
      expect(queuePath).toContain('merge-queue.json');
    });
  });

  describe('isEnabled', () => {
    it('returns false when metadata file does not exist', () => {
      fs.existsSync.mockReturnValue(false);
      expect(isEnabled()).toBe(false);
    });

    it('returns false when mergeQueue feature is not configured', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          features: { hooks: { enabled: true } },
        })
      );
      expect(isEnabled()).toBe(false);
    });

    it('returns true when mergeQueue.enabled is true', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          features: { mergeQueue: { enabled: true } },
        })
      );
      expect(isEnabled()).toBe(true);
    });

    it('returns false when mergeQueue.enabled is false', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          features: { mergeQueue: { enabled: false } },
        })
      );
      expect(isEnabled()).toBe(false);
    });

    it('returns false on JSON parse error (fail-open)', () => {
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockReturnValue('not json');
      expect(isEnabled()).toBe(false);
    });
  });

  describe('enqueue', () => {
    it('adds a merge request to empty queue', () => {
      fs.existsSync.mockReturnValue(false);

      const result = enqueue('session-1', { strategy: 'squash' });

      expect(result.queued).toBe(true);
      expect(result.position).toBe(1);
      expect(fileLock.atomicWriteJSON).toHaveBeenCalled();
    });

    it('appends to existing queue', () => {
      fs.existsSync.mockImplementation(p => p.includes('merge-queue'));
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          entries: [{ sessionId: 'session-1', enqueuedAt: new Date().toISOString(), pid: 1234 }],
          processing: null,
        })
      );

      const result = enqueue('session-2');

      expect(result.queued).toBe(true);
      expect(result.position).toBe(2);
    });

    it('detects already-queued session', () => {
      fs.existsSync.mockImplementation(p => p.includes('merge-queue'));
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          entries: [{ sessionId: 'session-1', enqueuedAt: new Date().toISOString(), pid: 1234 }],
          processing: null,
        })
      );

      const result = enqueue('session-1');

      expect(result.queued).toBe(true);
      expect(result.alreadyQueued).toBe(true);
    });

    it('detects session currently being processed', () => {
      fs.existsSync.mockImplementation(p => p.includes('merge-queue'));
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          entries: [],
          processing: {
            sessionId: 'session-1',
            startedAt: new Date().toISOString(),
            pid: process.pid,
          },
        })
      );
      // Processing PID must appear alive to survive pruning
      fileLock._isPidAlive.mockReturnValue(true);

      const result = enqueue('session-1');

      expect(result.queued).toBe(true);
      expect(result.isProcessing).toBe(true);
    });

    it('releases lock on success', () => {
      const result = enqueue('session-1');

      expect(fileLock.releaseLock).toHaveBeenCalledWith('/tmp/test.lock');
    });

    it('releases lock on error', () => {
      fileLock.atomicWriteJSON.mockImplementation(() => {
        throw new Error('Write failed');
      });

      const result = enqueue('session-1');

      expect(fileLock.releaseLock).toHaveBeenCalled();
    });

    it('returns error when lock acquisition fails', () => {
      fileLock.acquireLock.mockReturnValue({ acquired: false, error: 'timeout' });

      // Since enqueue catches errors, it should still work
      const result = enqueue('session-1');

      // Lock not acquired means finally block won't release
      expect(fileLock.releaseLock).not.toHaveBeenCalled();
    });
  });

  describe('dequeue', () => {
    it('returns first entry from queue', () => {
      fs.existsSync.mockImplementation(p => p.includes('merge-queue'));
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          entries: [
            { sessionId: 'session-1', enqueuedAt: new Date().toISOString(), pid: 1234 },
            { sessionId: 'session-2', enqueuedAt: new Date().toISOString(), pid: 5678 },
          ],
          processing: null,
        })
      );

      const result = dequeue();

      expect(result.entry).toBeTruthy();
      expect(result.entry.sessionId).toBe('session-1');
      expect(result.empty).toBe(false);
    });

    it('returns empty when queue is empty', () => {
      fs.existsSync.mockImplementation(p => p.includes('merge-queue'));
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          entries: [],
          processing: null,
        })
      );

      const result = dequeue();

      expect(result.entry).toBeNull();
      expect(result.empty).toBe(true);
    });

    it('returns busy when something is already processing', () => {
      fs.existsSync.mockImplementation(p => p.includes('merge-queue'));
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          entries: [{ sessionId: 'session-2', enqueuedAt: new Date().toISOString() }],
          processing: {
            sessionId: 'session-1',
            startedAt: new Date().toISOString(),
            pid: process.pid,
          },
        })
      );

      // Make PID appear alive
      fileLock._isPidAlive.mockReturnValue(true);

      const result = dequeue();

      expect(result.entry).toBeNull();
      expect(result.busy).toBe(true);
    });

    it('marks dequeued entry as processing', () => {
      fs.existsSync.mockImplementation(p => p.includes('merge-queue'));
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          entries: [{ sessionId: 'session-1', enqueuedAt: new Date().toISOString() }],
          processing: null,
        })
      );

      dequeue();

      // Verify atomicWriteJSON was called with processing set
      const writeCall = fileLock.atomicWriteJSON.mock.calls[0];
      const savedQueue = writeCall[1];
      expect(savedQueue.processing).toBeTruthy();
      expect(savedQueue.processing.sessionId).toBe('session-1');
    });
  });

  describe('markComplete', () => {
    it('clears processing state', () => {
      fs.existsSync.mockImplementation(p => p.includes('merge-queue'));
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          entries: [],
          processing: { sessionId: 'session-1', startedAt: new Date().toISOString() },
        })
      );

      const result = markComplete({ success: true });

      expect(result).toBe(true);
      const writeCall = fileLock.atomicWriteJSON.mock.calls[0];
      const savedQueue = writeCall[1];
      expect(savedQueue.processing).toBeNull();
    });
  });

  describe('_pruneStaleEntries', () => {
    it('removes processing entry with dead PID', () => {
      fileLock._isPidAlive.mockReturnValue(false);

      const queue = {
        entries: [],
        processing: {
          sessionId: 'session-1',
          startedAt: new Date().toISOString(),
          pid: 99999,
        },
      };

      const pruned = _pruneStaleEntries(queue);
      expect(pruned.processing).toBeNull();
    });

    it('keeps processing entry with live PID', () => {
      fileLock._isPidAlive.mockReturnValue(true);

      const queue = {
        entries: [],
        processing: {
          sessionId: 'session-1',
          startedAt: new Date().toISOString(),
          pid: process.pid,
        },
      };

      const pruned = _pruneStaleEntries(queue);
      expect(pruned.processing).toBeTruthy();
    });

    it('removes entries older than MAX_MERGE_HOLD_MS', () => {
      const oldDate = new Date(Date.now() - _MAX_MERGE_HOLD_MS - 1000).toISOString();
      const newDate = new Date().toISOString();

      const queue = {
        entries: [
          { sessionId: 'old', enqueuedAt: oldDate },
          { sessionId: 'new', enqueuedAt: newDate },
        ],
        processing: null,
      };

      const pruned = _pruneStaleEntries(queue);
      expect(pruned.entries).toHaveLength(1);
      expect(pruned.entries[0].sessionId).toBe('new');
    });

    it('removes stale processing entry that exceeded MAX_MERGE_HOLD_MS', () => {
      const oldDate = new Date(Date.now() - _MAX_MERGE_HOLD_MS - 1000).toISOString();
      fileLock._isPidAlive.mockReturnValue(true); // PID is alive but too old

      const queue = {
        entries: [],
        processing: {
          sessionId: 'session-1',
          startedAt: oldDate,
          pid: process.pid,
        },
      };

      const pruned = _pruneStaleEntries(queue);
      expect(pruned.processing).toBeNull();
    });
  });

  describe('getQueueStatus', () => {
    it('returns empty status when no queue file', () => {
      const status = getQueueStatus();

      expect(status.queueLength).toBe(0);
      expect(status.isProcessing).toBe(false);
      expect(status.entries).toEqual([]);
    });

    it('returns queue state', () => {
      const now = new Date();
      const recent1 = new Date(now.getTime() - 60000).toISOString();
      const recent2 = new Date(now.getTime() - 30000).toISOString();
      const recent3 = new Date(now.getTime() - 90000).toISOString();
      fs.existsSync.mockImplementation(p => p.includes('merge-queue'));
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          entries: [
            { sessionId: 'session-1', enqueuedAt: recent1 },
            { sessionId: 'session-2', enqueuedAt: recent2 },
          ],
          processing: {
            sessionId: 'session-0',
            startedAt: recent3,
            pid: process.pid,
          },
          lastUpdated: recent2,
        })
      );
      fileLock._isPidAlive.mockReturnValue(true);

      const status = getQueueStatus();

      expect(status.queueLength).toBe(2);
      expect(status.isProcessing).toBe(true);
      expect(status.processing.sessionId).toBe('session-0');
    });

    it('includes enabled flag', () => {
      const status = getQueueStatus();
      expect(typeof status.enabled).toBe('boolean');
    });
  });

  describe('wrapMerge', () => {
    it('passes through to merge function when queue is disabled', () => {
      // isEnabled returns false by default (no metadata file)
      const mergeFn = jest.fn(() => ({ success: true, strategy: 'squash' }));

      const result = wrapMerge('session-1', { strategy: 'squash' }, mergeFn);

      expect(mergeFn).toHaveBeenCalledWith('session-1', { strategy: 'squash' });
      expect(result.success).toBe(true);
    });

    it('logs to merge history even when queue is disabled', () => {
      const mergeFn = jest.fn(() => ({ success: true }));

      wrapMerge('session-1', {}, mergeFn);

      expect(mergeHistory.appendEntry).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-1', success: true })
      );
    });

    it('executes merge through queue when enabled', () => {
      // Make isEnabled return true
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(p => {
        if (p.includes('metadata')) {
          return JSON.stringify({ features: { mergeQueue: { enabled: true } } });
        }
        return JSON.stringify({ entries: [], processing: null });
      });

      const mergeFn = jest.fn(() => ({ success: true, strategy: 'squash' }));

      const result = wrapMerge('session-1', {}, mergeFn);

      expect(mergeFn).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('falls through to direct merge on queue failure (fail-open)', () => {
      // Make isEnabled return true
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(p => {
        if (p.includes('metadata')) {
          return JSON.stringify({ features: { mergeQueue: { enabled: true } } });
        }
        throw new Error('Read failed');
      });

      // Make lock acquisition fail
      fileLock.acquireLock.mockReturnValue({ acquired: false, error: 'timeout' });

      const mergeFn = jest.fn(() => ({ success: true }));

      const result = wrapMerge('session-1', {}, mergeFn);

      expect(mergeFn).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });
  });
});
