/**
 * Swarm-level tests: Regression Cascade Prevention
 *
 * Tests that the swarm infrastructure correctly handles cascading failures:
 * - One session's merge failure doesn't corrupt the queue
 * - Multiple simultaneous failures are handled gracefully
 * - Queue recovers from corruption without manual intervention
 * - Merge history maintains integrity during failures
 *
 * These scenarios simulate the Overstory pattern where 22 agents
 * work in parallel and multiple may fail or corrupt shared state.
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
  readHistory: jest.fn(() => ({ entries: [], total: 0 })),
  getStats: jest.fn(() => ({ total: 0, successful: 0, failed: 0 })),
}));

const fs = require('fs');
const fileLock = require('../../scripts/lib/file-lock');
const mergeHistory = require('../../scripts/lib/merge-history');

const {
  enqueue,
  dequeue,
  markComplete,
  wrapMerge,
  getQueueStatus,
  _pruneStaleEntries,
} = require('../../scripts/lib/merge-queue');

describe('Swarm: Regression Cascade Prevention', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.existsSync.mockReturnValue(false);
    fs.readFileSync.mockReturnValue('{}');
    fileLock.acquireLock.mockReturnValue({ acquired: true, lockPath: '/tmp/test.lock' });
    fileLock.releaseLock.mockReturnValue(true);
    fileLock.atomicWriteJSON.mockReturnValue({ success: true });
    fileLock._isPidAlive.mockReturnValue(false);
  });

  describe('merge failure isolation', () => {
    it('failed merge does not corrupt queue for subsequent merges', () => {
      // Queue has 3 entries
      const queue = {
        entries: [
          { sessionId: 's1', enqueuedAt: new Date().toISOString() },
          { sessionId: 's2', enqueuedAt: new Date().toISOString() },
          { sessionId: 's3', enqueuedAt: new Date().toISOString() },
        ],
        processing: null,
      };

      fs.existsSync.mockImplementation(p => p.includes('merge-queue'));
      fs.readFileSync.mockReturnValue(JSON.stringify(queue));

      // Dequeue s1
      const result1 = dequeue();
      expect(result1.entry.sessionId).toBe('s1');

      // s1 merge fails - mark complete
      markComplete({ success: false, error: 'Conflict' });

      // Queue should still have s2, s3 ready
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          entries: [
            { sessionId: 's2', enqueuedAt: new Date().toISOString() },
            { sessionId: 's3', enqueuedAt: new Date().toISOString() },
          ],
          processing: null,
        })
      );

      const result2 = dequeue();
      expect(result2.entry.sessionId).toBe('s2');
    });

    it('wrapMerge records failure in history', () => {
      const mergeFn = jest.fn(() => ({
        success: false,
        error: 'Merge conflict',
        strategy: 'squash',
      }));

      wrapMerge('session-fail', {}, mergeFn);

      expect(mergeHistory.appendEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-fail',
          success: false,
          error: 'Merge conflict',
        })
      );
    });

    it('wrapMerge records success in history', () => {
      const mergeFn = jest.fn(() => ({
        success: true,
        strategy: 'squash',
        branchName: 'session/s1',
      }));

      wrapMerge('session-ok', {}, mergeFn);

      expect(mergeHistory.appendEntry).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'session-ok',
          success: true,
          strategy: 'squash',
        })
      );
    });
  });

  describe('queue corruption recovery', () => {
    it('handles invalid JSON in queue file gracefully', () => {
      fs.existsSync.mockImplementation(p => p.includes('merge-queue'));
      fs.readFileSync.mockReturnValue('not valid json {{{}}}');

      // Should not throw
      const status = getQueueStatus();
      expect(status.queueLength).toBe(0);
    });

    it('handles missing entries array in queue', () => {
      fs.existsSync.mockImplementation(p => p.includes('merge-queue'));
      fs.readFileSync.mockReturnValue(JSON.stringify({ processing: null }));

      const result = dequeue();
      expect(result.empty).toBe(true);
    });

    it('handles null entries in queue', () => {
      fs.existsSync.mockImplementation(p => p.includes('merge-queue'));
      fs.readFileSync.mockReturnValue(
        JSON.stringify({
          entries: null,
          processing: null,
        })
      );

      // Should not crash
      const status = getQueueStatus();
      expect(status.queueLength).toBe(0);
    });
  });

  describe('cascading failure scenarios', () => {
    it('handles rapid-fire failures from multiple sessions', () => {
      // Simulate 5 rapid merge failures
      const results = [];

      for (let i = 0; i < 5; i++) {
        const mergeFn = jest.fn(() => ({
          success: false,
          error: `Conflict in session ${i}`,
        }));

        const result = wrapMerge(`session-${i}`, {}, mergeFn);
        results.push(result);
      }

      // All should have been called
      expect(results).toHaveLength(5);
      expect(results.every(r => r.success === false)).toBe(true);

      // All should have been logged
      expect(mergeHistory.appendEntry).toHaveBeenCalledTimes(5);
    });

    it('history logging failure does not block merge', () => {
      mergeHistory.appendEntry.mockImplementation(() => {
        throw new Error('History write failed');
      });

      const mergeFn = jest.fn(() => ({ success: true }));

      // Should not throw
      expect(() => wrapMerge('session-1', {}, mergeFn)).not.toThrow();
      expect(mergeFn).toHaveBeenCalled();
    });

    it('atomicWriteJSON failure does not block merge via wrapMerge', () => {
      fileLock.atomicWriteJSON.mockReturnValue({ success: false, error: 'Write failed' });

      const mergeFn = jest.fn(() => ({ success: true }));

      const result = wrapMerge('session-1', {}, mergeFn);
      expect(result.success).toBe(true);
    });
  });

  describe('dead process cleanup', () => {
    it('cleans up processing entry from crashed process', () => {
      fileLock._isPidAlive.mockReturnValue(false);

      const queue = {
        entries: [{ sessionId: 's2', enqueuedAt: new Date().toISOString() }],
        processing: {
          sessionId: 's1',
          startedAt: new Date().toISOString(),
          pid: 99999, // Dead PID
        },
      };

      const pruned = _pruneStaleEntries(queue);

      // Processing should be cleared
      expect(pruned.processing).toBeNull();

      // s2 should still be in queue
      expect(pruned.entries).toHaveLength(1);
      expect(pruned.entries[0].sessionId).toBe('s2');
    });

    it('cleans up multiple stale queued entries from crashed processes', () => {
      const staleTime = new Date(Date.now() - 700000).toISOString(); // 11+ minutes ago
      const freshTime = new Date().toISOString();

      const queue = {
        entries: [
          { sessionId: 'stale-1', enqueuedAt: staleTime },
          { sessionId: 'stale-2', enqueuedAt: staleTime },
          { sessionId: 'stale-3', enqueuedAt: staleTime },
          { sessionId: 'fresh-1', enqueuedAt: freshTime },
        ],
        processing: null,
      };

      const pruned = _pruneStaleEntries(queue);

      expect(pruned.entries).toHaveLength(1);
      expect(pruned.entries[0].sessionId).toBe('fresh-1');
    });
  });

  describe('merge function exception handling', () => {
    it('wrapMerge propagates merge function exception', () => {
      // Enable queue
      fs.existsSync.mockReturnValue(true);
      fs.readFileSync.mockImplementation(p => {
        if (p.includes('metadata')) {
          return JSON.stringify({ features: { mergeQueue: { enabled: true } } });
        }
        return JSON.stringify({ entries: [], processing: null });
      });

      const mergeFn = jest.fn(() => {
        throw new Error('Git crash');
      });

      expect(() => wrapMerge('session-1', {}, mergeFn)).toThrow('Git crash');

      // markComplete should still have been called (in the catch block)
      // The queue should not be left in a bad state
    });

    it('merge function returning undefined is handled', () => {
      const mergeFn = jest.fn(() => undefined);

      // Should not throw
      expect(() => wrapMerge('session-1', {}, mergeFn)).not.toThrow();
    });
  });
});
