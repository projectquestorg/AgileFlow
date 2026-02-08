/**
 * Tests for lib/session-operations.js
 *
 * Tests the extracted session CRUD, listing, stale lock cleanup,
 * and fullStatus operations via the factory pattern.
 */

const { createSessionOperations } = require('../../lib/session-operations');

// Mock dependencies
function createMockDeps(overrides = {}) {
  const sessions = {};
  let nextId = 1;
  const locks = {};

  const deps = {
    ROOT: '/mock/project',
    loadRegistry: jest.fn(() => ({
      schema_version: '1.0.0',
      next_id: nextId,
      project_name: 'test-project',
      sessions: { ...sessions },
      ...overrides.registryOverrides,
    })),
    saveRegistry: jest.fn((data) => {
      // Update nextId from saved data
      if (data.next_id) nextId = data.next_id;
      // Sync sessions
      Object.assign(sessions, data.sessions || {});
    }),
    readLock: jest.fn((id) => locks[id] || null),
    readLockAsync: jest.fn(async (id) => locks[id] || null),
    writeLock: jest.fn((id, pid) => { locks[id] = { pid: String(pid), started: Date.now() }; }),
    removeLock: jest.fn((id) => { delete locks[id]; }),
    isSessionActive: jest.fn(() => false),
    isSessionActiveAsync: jest.fn(async () => false),
    c: { yellow: '', reset: '' },
    // Expose internal state for assertions
    _sessions: sessions,
    _locks: locks,
    _setNextId: (id) => { nextId = id; },
    ...overrides,
  };

  return deps;
}

describe('session-operations', () => {
  describe('createSessionOperations factory', () => {
    test('returns object with all expected functions', () => {
      const deps = createMockDeps();
      const ops = createSessionOperations(deps);

      expect(typeof ops.processStalelock).toBe('function');
      expect(typeof ops.cleanupStaleLocks).toBe('function');
      expect(typeof ops.cleanupStaleLocksAsync).toBe('function');
      expect(typeof ops.getCurrentStory).toBe('function');
      expect(typeof ops.registerSession).toBe('function');
      expect(typeof ops.unregisterSession).toBe('function');
      expect(typeof ops.getSession).toBe('function');
      expect(typeof ops.createSession).toBe('function');
      expect(typeof ops.createTeamSession).toBe('function');
      expect(typeof ops.buildSessionsList).toBe('function');
      expect(typeof ops.getSessions).toBe('function');
      expect(typeof ops.getSessionsAsync).toBe('function');
      expect(typeof ops.getActiveSessionCount).toBe('function');
      expect(typeof ops.fullStatus).toBe('function');
      expect(typeof ops.deleteSession).toBe('function');
    });
  });

  describe('processStalelock', () => {
    test('returns null when lock is null', () => {
      const deps = createMockDeps();
      const ops = createSessionOperations(deps);
      expect(ops.processStalelock('1', { nickname: 'test' }, null, false)).toBeNull();
    });

    test('returns null when PID is alive', () => {
      const deps = createMockDeps();
      const ops = createSessionOperations(deps);
      // Current process PID is always alive
      const result = ops.processStalelock('1', { nickname: 'test' }, { pid: String(process.pid) }, false);
      expect(result).toBeNull();
    });

    test('removes lock and returns info for dead PID', () => {
      const deps = createMockDeps();
      const ops = createSessionOperations(deps);
      const result = ops.processStalelock(
        '1',
        { nickname: 'test', branch: 'main', path: '/test' },
        { pid: '999999999' },
        false
      );
      expect(result).not.toBeNull();
      expect(result.id).toBe('1');
      expect(result.reason).toBe('pid_dead');
      expect(deps.removeLock).toHaveBeenCalledWith('1');
    });

    test('does not remove lock in dry run mode', () => {
      const deps = createMockDeps();
      const ops = createSessionOperations(deps);
      const result = ops.processStalelock(
        '1',
        { nickname: 'test', branch: 'main', path: '/test' },
        { pid: '999999999' },
        true // dryRun
      );
      expect(result).not.toBeNull();
      expect(deps.removeLock).not.toHaveBeenCalled();
    });
  });

  describe('cleanupStaleLocks', () => {
    test('returns empty result for registry with no sessions', () => {
      const deps = createMockDeps();
      const ops = createSessionOperations(deps);
      const registry = { sessions: {} };
      const result = ops.cleanupStaleLocks(registry);
      expect(result.count).toBe(0);
      expect(result.sessions).toEqual([]);
    });

    test('cleans up stale locks for dead PIDs', () => {
      const deps = createMockDeps();
      deps.readLock.mockReturnValue({ pid: '999999999' });
      const ops = createSessionOperations(deps);
      const registry = {
        sessions: {
          '1': { nickname: 'test', branch: 'main', path: '/test' },
        },
      };
      const result = ops.cleanupStaleLocks(registry);
      expect(result.count).toBe(1);
      expect(result.sessions[0].id).toBe('1');
    });

    test('respects dry run option', () => {
      const deps = createMockDeps();
      deps.readLock.mockReturnValue({ pid: '999999999' });
      const ops = createSessionOperations(deps);
      const registry = {
        sessions: { '1': { nickname: 'test', branch: 'main', path: '/test' } },
      };
      const result = ops.cleanupStaleLocks(registry, { dryRun: true });
      expect(result.count).toBe(1);
      expect(deps.removeLock).not.toHaveBeenCalled();
    });
  });

  describe('cleanupStaleLocksAsync', () => {
    test('returns empty result for empty sessions', async () => {
      const deps = createMockDeps();
      const ops = createSessionOperations(deps);
      const result = await ops.cleanupStaleLocksAsync({ sessions: {} });
      expect(result.count).toBe(0);
    });

    test('processes locks in parallel', async () => {
      const deps = createMockDeps();
      deps.readLockAsync.mockResolvedValue({ pid: '999999999' });
      const ops = createSessionOperations(deps);
      const registry = {
        sessions: {
          '1': { nickname: 'a', branch: 'main', path: '/a' },
          '2': { nickname: 'b', branch: 'feat', path: '/b' },
        },
      };
      const result = await ops.cleanupStaleLocksAsync(registry);
      expect(result.count).toBe(2);
      expect(deps.readLockAsync).toHaveBeenCalledTimes(2);
    });
  });

  describe('buildSessionsList', () => {
    test('sorts sessions by numeric ID', () => {
      const deps = createMockDeps();
      const ops = createSessionOperations(deps);
      const sessions = ops.buildSessionsList(
        { '10': { path: '/a' }, '2': { path: '/b' }, '1': { path: '/c' } },
        { '10': false, '2': true, '1': false },
        '/b'
      );
      expect(sessions[0].id).toBe('1');
      expect(sessions[1].id).toBe('2');
      expect(sessions[2].id).toBe('10');
    });

    test('marks current session correctly', () => {
      const deps = createMockDeps();
      const ops = createSessionOperations(deps);
      const sessions = ops.buildSessionsList(
        { '1': { path: '/a' }, '2': { path: '/b' } },
        { '1': true, '2': false },
        '/b'
      );
      expect(sessions[0].current).toBe(false);
      expect(sessions[1].current).toBe(true);
    });

    test('applies active checks from map', () => {
      const deps = createMockDeps();
      const ops = createSessionOperations(deps);
      const sessions = ops.buildSessionsList(
        { '1': { path: '/a' } },
        { '1': true },
        '/x'
      );
      expect(sessions[0].active).toBe(true);
    });

    test('defaults active to false when not in map', () => {
      const deps = createMockDeps();
      const ops = createSessionOperations(deps);
      const sessions = ops.buildSessionsList(
        { '1': { path: '/a' } },
        {},
        '/x'
      );
      expect(sessions[0].active).toBe(false);
    });
  });

  describe('getSession', () => {
    test('returns null for non-existent session', () => {
      const deps = createMockDeps();
      const ops = createSessionOperations(deps);
      expect(ops.getSession('999')).toBeNull();
    });

    test('returns session with thread_type defaulted for legacy main session', () => {
      const deps = createMockDeps({
        registryOverrides: {
          sessions: { '1': { path: '/test', is_main: true, branch: 'main' } },
        },
      });
      const ops = createSessionOperations(deps);
      const session = ops.getSession('1');
      expect(session.thread_type).toBe('base');
    });

    test('returns session with thread_type defaulted for legacy non-main session', () => {
      const deps = createMockDeps({
        registryOverrides: {
          sessions: { '1': { path: '/test', is_main: false, branch: 'feat' } },
        },
      });
      const ops = createSessionOperations(deps);
      const session = ops.getSession('1');
      expect(session.thread_type).toBe('parallel');
    });

    test('preserves explicit thread_type', () => {
      const deps = createMockDeps({
        registryOverrides: {
          sessions: { '1': { path: '/test', thread_type: 'fusion', branch: 'feat' } },
        },
      });
      const ops = createSessionOperations(deps);
      const session = ops.getSession('1');
      expect(session.thread_type).toBe('fusion');
    });

    test('includes active status', () => {
      const deps = createMockDeps({
        registryOverrides: {
          sessions: { '1': { path: '/test', branch: 'main' } },
        },
      });
      deps.isSessionActive.mockReturnValue(true);
      const ops = createSessionOperations(deps);
      const session = ops.getSession('1');
      expect(session.active).toBe(true);
    });
  });

  describe('deleteSession', () => {
    test('returns error for non-existent session', () => {
      const deps = createMockDeps();
      const ops = createSessionOperations(deps);
      const result = ops.deleteSession('999');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('prevents deletion of main session', () => {
      const deps = createMockDeps({
        registryOverrides: {
          sessions: { '1': { path: '/test', is_main: true } },
        },
      });
      const ops = createSessionOperations(deps);
      const result = ops.deleteSession('1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('main session');
    });

    test('removes lock and deletes session from registry', () => {
      const deps = createMockDeps({
        registryOverrides: {
          sessions: { '2': { path: '/other', is_main: false } },
        },
      });
      const ops = createSessionOperations(deps);
      const result = ops.deleteSession('2');
      expect(result.success).toBe(true);
      expect(deps.removeLock).toHaveBeenCalledWith('2');
      expect(deps.saveRegistry).toHaveBeenCalled();
    });
  });

  describe('fullStatus', () => {
    test('returns result with registered flag', () => {
      const deps = createMockDeps();
      const ops = createSessionOperations(deps);
      const result = ops.fullStatus();
      expect(result.registered).toBe(true);
      expect(result.id).toBeDefined();
      expect(result.isNew).toBe(true);
    });

    test('updates existing session if path matches', () => {
      const cwd = process.cwd();
      const deps = createMockDeps({
        registryOverrides: {
          sessions: {
            '5': { path: cwd, branch: 'old-branch', is_main: false },
          },
          next_id: 10,
        },
      });
      const ops = createSessionOperations(deps);
      const result = ops.fullStatus();
      expect(result.isNew).toBe(false);
      expect(result.id).toBe('5');
    });

    test('applies nickname when provided', () => {
      const cwd = process.cwd();
      const deps = createMockDeps({
        registryOverrides: {
          sessions: {
            '5': { path: cwd, branch: 'main', is_main: false, nickname: null },
          },
          next_id: 10,
        },
      });
      const ops = createSessionOperations(deps);
      ops.fullStatus('my-nickname');
      // Verify saveRegistry was called with updated nickname
      const savedData = deps.saveRegistry.mock.calls[0][0];
      expect(savedData.sessions['5'].nickname).toBe('my-nickname');
    });
  });
});
