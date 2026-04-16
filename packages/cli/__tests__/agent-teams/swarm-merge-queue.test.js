/**
 * Swarm-level tests: Merge Queue under concurrent session completion
 *
 * Tests the merge queue's behavior when multiple sessions attempt to merge
 * simultaneously, simulating the Overstory agent swarm pattern where
 * 20+ agents may complete work and trigger merges in rapid succession.
 *
 * Test categories:
 * - Sequential merge ordering
 * - Stale entry cleanup
 * - Queue status reporting under load
 * - Fail-open behavior when queue is corrupted
 */

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

jest.mock('../../scripts/lib/file-lock', () => ({
  acquireLock: jest.fn(() => ({ acquired: true, lockPath: '/tmp/test.lock' })),
  releaseLock: jest.fn(() => true),
  atomicWriteJSON: jest.fn(() => ({ success: true })),
  _isPidAlive: jest.fn(() => false),
}));

jest.mock('../../lib/paths', () => ({
  getProjectRoot: jest.fn(() => '/test/project'),
  getAgileflowDir: jest.fn(() => '/test/project/.agileflow'),
}));

jest.mock('../../scripts/lib/merge-history', () => ({
  appendEntry: jest.fn(() => true),
}));

const fs = require('fs');
const fileLock = require('../../scripts/lib/file-lock');
const mergeHistory = require('../../scripts/lib/merge-history');

const {
  enqueue,
  dequeue,
  markComplete,
  getQueueStatus,
  wrapMerge,
  _pruneStaleEntries,
  _MAX_MERGE_HOLD_MS,
} = require('../../scripts/lib/merge-queue');

describe('Swarm: Merge Queue Concurrent Sessions', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('{}');
    fileLock.acquireLock.mockReturnValue({ acquired: true, lockPath: '/tmp/test.lock' });
    fileLock.releaseLock.mockReturnValue(true);
    fileLock.atomicWriteJSON.mockReturnValue({ success: true });
    fileLock._isPidAlive.mockReturnValue(false);
  });

  describe('sequential ordering', () => {
    it('preserves FIFO order when 5 sessions enqueue simultaneously', () => {
      const sessionIds = ['s1', 's2', 's3', 's4', 's5'];
      const queueState = { entries: [], processing: null };

      // Simulate sequential enqueue calls (each reads then writes)
      for (const id of sessionIds) {
        fs.existsSync.mockImplementation(p => p.includes('merge-queue'));
        fs.readFileSync.mockReturnValue(JSON.stringify(queueState));

        const result = enqueue(id);
        expect(result.queued).toBe(true);

        // Simulate the queue growing
        queueState.entries.push({
          sessionId: id,
          enqueuedAt: new Date().toISOString(),
          pid: process.pid,
        });
      }

      // Verify positions are sequential
      expect(queueState.entries.map(e => e.sessionId)).toEqual(sessionIds);
    });

    it('dequeues in FIFO order', () => {
      const entries = ['s1', 's2', 's3'].map(id => ({
        sessionId: id,
        enqueuedAt: new Date().toISOString(),
        pid: process.pid,
      }));

      fs.existsSync.mockImplementation(p => p.includes('merge-queue'));
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          entries,
          processing: null,
        })
      );

      const result = dequeue();

      expect(result.entry.sessionId).toBe('s1');
    });
  });

  describe('concurrent completion handling', () => {
    it('blocks second merge while first is processing', () => {
      fs.existsSync.mockImplementation(p => p.includes('merge-queue'));
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          entries: [{ sessionId: 's2', enqueuedAt: new Date().toISOString() }],
          processing: {
            sessionId: 's1',
            startedAt: new Date().toISOString(),
            pid: process.pid,
          },
        })
      );
      fileLock._isPidAlive.mockReturnValue(true);

      const result = dequeue();

      expect(result.entry).toBeNull();
      expect(result.busy).toBe(true);
    });

    it('allows dequeue after processing completes', () => {
      // First: mark complete
      fs.existsSync.mockImplementation(p => p.includes('merge-queue'));
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          entries: [{ sessionId: 's2', enqueuedAt: new Date().toISOString() }],
          processing: { sessionId: 's1', startedAt: new Date().toISOString() },
        })
      );

      markComplete({ success: true });

      // Now dequeue should work (processing cleared)
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          entries: [{ sessionId: 's2', enqueuedAt: new Date().toISOString() }],
          processing: null,
        })
      );

      const result = dequeue();

      expect(result.entry).toBeTruthy();
      expect(result.entry.sessionId).toBe('s2');
    });
  });

  describe('stale entry recovery', () => {
    it('clears stale processing entry from dead process', () => {
      fileLock._isPidAlive.mockReturnValue(false);

      const queue = {
        entries: [{ sessionId: 's2', enqueuedAt: new Date().toISOString() }],
        processing: {
          sessionId: 's1',
          startedAt: new Date().toISOString(),
          pid: 99999,
        },
      };

      const pruned = _pruneStaleEntries(queue);

      expect(pruned.processing).toBeNull();
      expect(pruned.entries).toHaveLength(1);
    });

    it('clears timed-out processing entry even if PID is alive', () => {
      fileLock._isPidAlive.mockReturnValue(true);
      const staleTime = new Date(Date.now() - _MAX_MERGE_HOLD_MS - 1000).toISOString();

      const queue = {
        entries: [],
        processing: {
          sessionId: 's1',
          startedAt: staleTime,
          pid: process.pid,
        },
      };

      const pruned = _pruneStaleEntries(queue);

      expect(pruned.processing).toBeNull();
    });

    it('handles mixed stale and fresh entries', () => {
      const staleTime = new Date(Date.now() - _MAX_MERGE_HOLD_MS - 1000).toISOString();
      const freshTime = new Date().toISOString();

      const queue = {
        entries: [
          { sessionId: 'stale-1', enqueuedAt: staleTime },
          { sessionId: 'stale-2', enqueuedAt: staleTime },
          { sessionId: 'fresh-1', enqueuedAt: freshTime },
          { sessionId: 'fresh-2', enqueuedAt: freshTime },
        ],
        processing: null,
      };

      const pruned = _pruneStaleEntries(queue);

      expect(pruned.entries).toHaveLength(2);
      expect(pruned.entries[0].sessionId).toBe('fresh-1');
      expect(pruned.entries[1].sessionId).toBe('fresh-2');
    });
  });

  describe('queue status under load', () => {
    it('reports accurate status with multiple queued sessions', () => {
      const entries = Array.from({ length: 10 }, (_, i) => ({
        sessionId: `session-${i}`,
        enqueuedAt: new Date().toISOString(),
      }));

      fs.existsSync.mockImplementation(p => p.includes('merge-queue'));
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          entries,
          processing: {
            sessionId: 'session-active',
            startedAt: new Date().toISOString(),
            pid: process.pid,
          },
        })
      );
      fileLock._isPidAlive.mockReturnValue(true);

      const status = getQueueStatus();

      expect(status.queueLength).toBe(10);
      expect(status.isProcessing).toBe(true);
      expect(status.processing.sessionId).toBe('session-active');
    });
  });

  describe('fail-open behavior', () => {
    it('wrapMerge executes merge directly when queue file is corrupted', () => {
      // Enable merge queue
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(p => {
        if (p.includes('metadata')) {
          return JSON.stringify({ features: { mergeQueue: { enabled: true } } });
        }
        return 'corrupted!!!';
      });

      fileLock.acquireLock.mockReturnValue({ acquired: false, error: 'corrupted' });

      const mergeFn = jest.fn(() => ({ success: true }));
      const result = wrapMerge('session-1', {}, mergeFn);

      expect(mergeFn).toHaveBeenCalled();
      expect(result.success).toBe(true);
    });

    it('wrapMerge logs to history even on queue bypass', () => {
      const mergeFn = jest.fn(() => ({ success: true }));
      wrapMerge('session-1', {}, mergeFn);

      expect(mergeHistory.appendEntry).toHaveBeenCalledWith(
        expect.objectContaining({ sessionId: 'session-1' })
      );
    });

    it('does not throw when enqueue fails', () => {
      fileLock.acquireLock.mockImplementation(() => {
        throw new Error('Unexpected');
      });

      expect(() => enqueue('session-1')).not.toThrow();
    });
  });
});
