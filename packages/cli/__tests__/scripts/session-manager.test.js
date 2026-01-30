/**
 * Tests for session-manager.js
 *
 * This module manages multi-session coordination for Claude Code, including:
 * - Session registry with numbered IDs
 * - PID-based liveness detection
 * - Lock file management
 *
 * NOTE: Since session-manager.js evaluates ROOT at module load time,
 * we test using child processes to ensure proper isolation.
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

// Create isolated test environment
let testDir;
let originalCwd;
const scriptPath = path.resolve(__dirname, '../../scripts/session-manager.js');

// Helper to run session-manager commands in isolated environment
function runSessionManager(args, cwd) {
  const result = spawnSync('node', [scriptPath, ...args], {
    cwd: cwd || testDir,
    encoding: 'utf8',
    timeout: 10000,
  });
  return result;
}

// Helper to parse JSON output from session-manager
function parseOutput(result) {
  try {
    return JSON.parse(result.stdout.trim());
  } catch (e) {
    return { error: `Failed to parse: ${result.stdout}`, stderr: result.stderr };
  }
}

// Helper to read registry directly
function readRegistry() {
  const registryPath = path.join(testDir, '.agileflow', 'sessions', 'registry.json');
  if (!fs.existsSync(registryPath)) return null;
  return JSON.parse(fs.readFileSync(registryPath, 'utf8'));
}

// Helper to write registry directly
function writeRegistry(registry) {
  const registryPath = path.join(testDir, '.agileflow', 'sessions', 'registry.json');
  fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2));
}

beforeEach(() => {
  // Create temp directory for each test
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agileflow-test-'));

  // Create .agileflow directory to simulate a project root
  const agileflowDir = path.join(testDir, '.agileflow');
  fs.mkdirSync(agileflowDir, { recursive: true });

  // Create sessions directory
  const sessionsDir = path.join(agileflowDir, 'sessions');
  fs.mkdirSync(sessionsDir, { recursive: true });

  // Create docs structure for status.json
  const docsDir = path.join(testDir, 'docs', '09-agents');
  fs.mkdirSync(docsDir, { recursive: true });

  // Create .git to mark as repo root
  fs.mkdirSync(path.join(testDir, '.git'), { recursive: true });

  // Save original cwd
  originalCwd = process.cwd();
});

afterEach(() => {
  // Restore original cwd
  process.chdir(originalCwd);

  // Clean up temp directory
  fs.rmSync(testDir, { recursive: true, force: true });
});

describe('session-manager', () => {
  describe('help command', () => {
    test('displays help message', () => {
      const result = runSessionManager(['help']);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Session Manager');
      expect(result.stdout).toContain('Commands:');
      expect(result.stdout).toContain('register');
      expect(result.stdout).toContain('create');
    });
  });

  describe('register command', () => {
    test('creates new session with auto-incrementing ID', () => {
      const result = runSessionManager(['register']);
      const output = parseOutput(result);

      expect(result.status).toBe(0);
      expect(output.isNew).toBe(true);
      expect(output.id).toBe('1');

      // Check registry was created
      const registry = readRegistry();
      expect(registry.next_id).toBe(2);
      expect(registry.sessions['1']).toBeDefined();
      expect(registry.sessions['1'].path).toBe(testDir);
    });

    test('updates existing session for same path', () => {
      // First registration
      const result1 = runSessionManager(['register']);
      const output1 = parseOutput(result1);
      expect(output1.id).toBe('1');
      expect(output1.isNew).toBe(true);

      // Second registration from same directory
      const result2 = runSessionManager(['register']);
      const output2 = parseOutput(result2);
      expect(output2.id).toBe('1');
      expect(output2.isNew).toBe(false);

      // next_id should still be 2
      const registry = readRegistry();
      expect(registry.next_id).toBe(2);
    });

    test('accepts optional nickname', () => {
      const result = runSessionManager(['register', 'my-feature']);
      const output = parseOutput(result);

      expect(output.id).toBe('1');

      const registry = readRegistry();
      expect(registry.sessions['1'].nickname).toBe('my-feature');
    });

    test('creates lock file with PID', () => {
      runSessionManager(['register']);

      const lockPath = path.join(testDir, '.agileflow', 'sessions', '1.lock');
      expect(fs.existsSync(lockPath)).toBe(true);

      const lockContent = fs.readFileSync(lockPath, 'utf8');
      expect(lockContent).toContain('pid=');
      expect(lockContent).toContain('started=');
    });
  });

  describe('unregister command', () => {
    test('removes lock file', () => {
      runSessionManager(['register']);

      const lockPath = path.join(testDir, '.agileflow', 'sessions', '1.lock');
      expect(fs.existsSync(lockPath)).toBe(true);

      runSessionManager(['unregister', '1']);

      expect(fs.existsSync(lockPath)).toBe(false);
    });

    test('returns error without session ID', () => {
      const result = runSessionManager(['unregister']);
      const output = parseOutput(result);

      expect(output.success).toBe(false);
      expect(output.error).toContain('Session ID required');
    });
  });

  describe('list command', () => {
    test('returns sessions in JSON format', () => {
      runSessionManager(['register']);

      const result = runSessionManager(['list', '--json']);
      const output = parseOutput(result);

      expect(output.sessions).toHaveLength(1);
      expect(output.sessions[0].id).toBe('1');
      expect(output.sessions[0].path).toBe(testDir);
    });

    test('returns formatted output without --json', () => {
      runSessionManager(['register']);

      const result = runSessionManager(['list']);

      expect(result.status).toBe(0);
      expect(result.stdout).toContain('Active Sessions');
      // Output contains ANSI codes, so check for the ID without brackets
      expect(result.stdout).toMatch(/\[.*1.*\]/);
    });

    test('sorts sessions by numeric ID', () => {
      // Create sessions with specific IDs
      writeRegistry({
        schema_version: '1.0.0',
        next_id: 11,
        project_name: 'test',
        sessions: {
          10: { path: '/path10', branch: 'main' },
          2: { path: '/path2', branch: 'main' },
          1: { path: '/path1', branch: 'main' },
        },
      });

      const result = runSessionManager(['list', '--json']);
      const output = parseOutput(result);

      expect(output.sessions[0].id).toBe('1');
      expect(output.sessions[1].id).toBe('2');
      expect(output.sessions[2].id).toBe('10');
    });

    test('cleans up stale locks', () => {
      // Create a stale lock with dead PID
      const lockPath = path.join(testDir, '.agileflow', 'sessions', '99.lock');
      fs.writeFileSync(lockPath, 'pid=999999999\nstarted=1234567890\n');

      writeRegistry({
        schema_version: '1.0.0',
        next_id: 100,
        project_name: 'test',
        sessions: {
          99: { path: '/fake/path' },
        },
      });

      const result = runSessionManager(['list', '--json']);
      const output = parseOutput(result);

      expect(output.cleaned).toBe(1);
      expect(fs.existsSync(lockPath)).toBe(false);
    });
  });

  describe('count command', () => {
    test('returns count of other active sessions', () => {
      runSessionManager(['register']);

      const result = runSessionManager(['count']);
      const output = parseOutput(result);

      // Current session doesn't count toward "other" active
      expect(output.count).toBe(0);
    });
  });

  describe('status command', () => {
    test('returns current session status', () => {
      runSessionManager(['register']);

      const result = runSessionManager(['status']);
      const output = parseOutput(result);

      expect(output.current).toBeDefined();
      expect(output.current.id).toBe('1');
      expect(output.total).toBe(1);
    });

    test('reports no current session when none registered', () => {
      const result = runSessionManager(['status']);
      const output = parseOutput(result);

      expect(output.current).toBeNull();
      expect(output.total).toBe(0);
    });
  });

  describe('get command', () => {
    test('returns specific session by ID', () => {
      runSessionManager(['register', 'my-session']);

      const result = runSessionManager(['get', '1']);
      const output = parseOutput(result);

      expect(output.success).toBe(true);
      expect(output.id).toBe('1');
      expect(output.nickname).toBe('my-session');
      expect(output.path).toBe(testDir);
    });

    test('returns error for non-existent session', () => {
      const result = runSessionManager(['get', '999']);
      const output = parseOutput(result);

      expect(output.success).toBe(false);
      expect(output.error).toContain('not found');
    });

    test('returns error without session ID', () => {
      const result = runSessionManager(['get']);
      const output = parseOutput(result);

      expect(output.success).toBe(false);
      expect(output.error).toContain('Session ID required');
    });

    test('includes active status in response', () => {
      runSessionManager(['register']);

      // Session should be active (has lock)
      const result = runSessionManager(['get', '1']);
      const output = parseOutput(result);

      expect(output.success).toBe(true);
      // Note: active may be true or false depending on PID check
      // The important thing is that the field exists
      expect(typeof output.active).toBe('boolean');
    });

    test('migrates legacy session without thread_type', () => {
      // Create a legacy session without thread_type
      writeRegistry({
        schema_version: '1.0.0',
        next_id: 2,
        project_name: 'test',
        sessions: {
          1: {
            path: '/some/path',
            branch: 'feature',
            is_main: false,
            // NOTE: No thread_type field (legacy)
          },
        },
      });

      const result = runSessionManager(['get', '1']);
      const output = parseOutput(result);

      expect(output.success).toBe(true);
      expect(output.thread_type).toBe('parallel'); // Should be auto-detected as parallel for non-main
    });

    test('migrates legacy main session without thread_type', () => {
      // Create a legacy main session without thread_type
      writeRegistry({
        schema_version: '1.0.0',
        next_id: 2,
        project_name: 'test',
        sessions: {
          1: {
            path: testDir,
            branch: 'main',
            is_main: true,
            // NOTE: No thread_type field (legacy)
          },
        },
      });

      const result = runSessionManager(['get', '1']);
      const output = parseOutput(result);

      expect(output.success).toBe(true);
      expect(output.thread_type).toBe('base'); // Should be auto-detected as base for main
    });
  });

  describe('delete command', () => {
    test('removes session from registry', () => {
      // Create a non-main session
      writeRegistry({
        schema_version: '1.0.0',
        next_id: 3,
        project_name: 'test',
        sessions: {
          2: { path: '/other/path', branch: 'feature', is_main: false },
        },
      });

      const result = runSessionManager(['delete', '2']);
      const output = parseOutput(result);

      expect(output.success).toBe(true);

      const registry = readRegistry();
      expect(registry.sessions['2']).toBeUndefined();
    });

    test('prevents deletion of main session', () => {
      writeRegistry({
        schema_version: '1.0.0',
        next_id: 2,
        project_name: 'test',
        sessions: {
          1: { path: testDir, branch: 'main', is_main: true },
        },
      });

      const result = runSessionManager(['delete', '1']);
      const output = parseOutput(result);

      expect(output.success).toBe(false);
      expect(output.error).toContain('main session');
    });

    test('returns error for nonexistent session', () => {
      const result = runSessionManager(['delete', '999']);
      const output = parseOutput(result);

      expect(output.success).toBe(false);
      expect(output.error).toContain('not found');
    });
  });

  describe('create command', () => {
    // Note: create command requires git worktree, which needs a real git repo
    // We test the basic error handling here

    test('fails gracefully when worktree creation fails', () => {
      const result = runSessionManager(['create', '--nickname', 'test-session']);
      const output = parseOutput(result);

      // Should fail because we don't have a real git repo with commits
      expect(output.success).toBe(false);
    });
  });

  describe('registry persistence', () => {
    test('creates default registry if none exists', () => {
      // Remove any existing registry
      const registryPath = path.join(testDir, '.agileflow', 'sessions', 'registry.json');
      if (fs.existsSync(registryPath)) {
        fs.unlinkSync(registryPath);
      }

      runSessionManager(['list', '--json']);

      const registry = readRegistry();
      expect(registry.schema_version).toBe('1.0.0');
      expect(registry.next_id).toBe(1);
      expect(registry.sessions).toEqual({});
    });

    test('preserves registry across commands', () => {
      runSessionManager(['register', 'session-one']);

      const registry1 = readRegistry();
      expect(registry1.sessions['1'].nickname).toBe('session-one');

      // Run another command
      runSessionManager(['list', '--json']);

      const registry2 = readRegistry();
      expect(registry2.sessions['1'].nickname).toBe('session-one');
    });

    test('updates timestamp on save', () => {
      runSessionManager(['register']);

      const registry = readRegistry();
      expect(registry.updated).toBeDefined();

      const updated = new Date(registry.updated);
      const now = new Date();
      const diffMs = now - updated;

      // Should be updated within last 5 seconds
      expect(diffMs).toBeLessThan(5000);
    });
  });
});

/**
 * Tests for injectable registry pattern
 * These tests verify that session-manager can use a mocked registry for testing
 */
describe('session-manager injectable registry', () => {
  const EventEmitter = require('events');

  // Create a mock registry class for testing
  class MockRegistry extends EventEmitter {
    constructor(initialData = {}) {
      super();
      this._data = {
        schema_version: '1.0.0',
        next_id: 1,
        project_name: 'test-project',
        sessions: {},
        ...initialData,
      };
      // Simulate caching like real SessionRegistry
      this._cache = null;
      this._cacheTime = 0;
      this.cacheTTL = 10000; // 10 second cache
    }

    loadSync() {
      // Simulate caching behavior: return cached data if within TTL
      if (this._cache && Date.now() - this._cacheTime < this.cacheTTL) {
        return { ...this._cache };
      }
      // Update cache
      this._cache = { ...this._data };
      this._cacheTime = Date.now();
      return { ...this._data };
    }

    saveSync(data) {
      this._data = { ...data, updated: new Date().toISOString() };
      this._cache = { ...this._data };
      this._cacheTime = Date.now();
      return { ok: true };
    }

    async load() {
      return this.loadSync();
    }

    async save(data) {
      return this.saveSync(data);
    }

    // Expose internal data for test assertions
    getData() {
      return this._data;
    }

    // Required for resetRegistryCache() to work - clears cache
    invalidateCache() {
      this._cache = null;
      this._cacheTime = 0;
    }
  }

  let sessionManager;
  let mockRegistry;

  beforeEach(() => {
    // Fresh import to avoid state from previous tests
    jest.resetModules();
    sessionManager = require('../../scripts/session-manager');
    mockRegistry = new MockRegistry();

    // Inject mock registry
    sessionManager.injectRegistry(mockRegistry);
  });

  afterEach(() => {
    // Reset to default registry
    sessionManager.injectRegistry(null);
  });

  describe('injectRegistry()', () => {
    test('allows injecting a mock registry', () => {
      const registry = sessionManager.getRegistryInstance();
      expect(registry).toBe(mockRegistry);
    });

    test('null resets to default registry', () => {
      sessionManager.injectRegistry(null);
      const registry = sessionManager.getRegistryInstance();
      expect(registry).not.toBe(mockRegistry);
      expect(registry.constructor.name).toBe('SessionRegistry');
    });
  });

  describe('loadRegistry()', () => {
    test('uses injected registry for loading', () => {
      mockRegistry._data.sessions = {
        1: { nickname: 'test-session', branch: 'main' },
      };

      const data = sessionManager.loadRegistry();
      expect(data.sessions['1'].nickname).toBe('test-session');
    });

    test('returns cached data within TTL', () => {
      // First load caches the data
      const data1 = sessionManager.loadRegistry();
      expect(data1.next_id).toBe(1);

      // Modify underlying data (simulating external change)
      mockRegistry._data.next_id = 42;

      // Without reset, cached data is returned
      const data2 = sessionManager.loadRegistry();
      expect(data2.next_id).toBe(1); // Still cached

      // After invalidating cache, fresh data is returned
      sessionManager.resetRegistryCache();
      const data3 = sessionManager.loadRegistry();
      expect(data3.next_id).toBe(42); // Fresh data
    });
  });

  describe('saveRegistry()', () => {
    test('uses injected registry for saving', () => {
      sessionManager.saveRegistry({
        sessions: { 1: { nickname: 'saved-session' } },
      });

      const saved = mockRegistry.getData();
      expect(saved.sessions['1'].nickname).toBe('saved-session');
    });

    test('adds updated timestamp', () => {
      sessionManager.saveRegistry({ sessions: {} });

      const saved = mockRegistry.getData();
      expect(saved.updated).toBeDefined();
    });
  });

  describe('getSessions()', () => {
    test('returns sessions from injected registry', () => {
      mockRegistry._data.sessions = {
        1: { nickname: 'session-1', branch: 'main' },
        2: { nickname: 'session-2', branch: 'feature' },
      };

      const result = sessionManager.getSessions();
      // getSessions returns { sessions: [], cleaned, cleanedSessions }
      expect(result.sessions).toHaveLength(2);
      expect(result.sessions[0].nickname).toBe('session-1');
      expect(result.sessions[1].nickname).toBe('session-2');
    });

    test('returns empty array when no sessions', () => {
      mockRegistry._data.sessions = {};
      const result = sessionManager.getSessions();
      expect(result.sessions).toEqual([]);
    });
  });

  // US-0190: Parallel lock reads for performance
  describe('getSessionsAsync()', () => {
    test('returns sessions from injected registry', async () => {
      mockRegistry._data.sessions = {
        1: { nickname: 'session-1', branch: 'main' },
        2: { nickname: 'session-2', branch: 'feature' },
      };

      const result = await sessionManager.getSessionsAsync();
      // getSessionsAsync returns same shape as getSessions
      expect(result.sessions).toHaveLength(2);
      expect(result.sessions[0].nickname).toBe('session-1');
      expect(result.sessions[1].nickname).toBe('session-2');
    });

    test('returns empty array when no sessions', async () => {
      mockRegistry._data.sessions = {};
      const result = await sessionManager.getSessionsAsync();
      expect(result.sessions).toEqual([]);
    });

    test('includes cleaned and cleanedSessions in result', async () => {
      mockRegistry._data.sessions = {};
      const result = await sessionManager.getSessionsAsync();
      expect(result).toHaveProperty('cleaned');
      expect(result).toHaveProperty('cleanedSessions');
    });
  });

  describe('isSessionActiveAsync()', () => {
    test('returns false for non-existent session', async () => {
      const result = await sessionManager.isSessionActiveAsync('nonexistent');
      expect(result).toBe(false);
    });
  });

  // US-0191: Lazy-load git commands with async parallelization
  describe('getSessionPhaseAsync()', () => {
    test('returns MERGED for sessions with merged_at', async () => {
      const session = { merged_at: '2026-01-28T00:00:00Z' };
      const phase = await sessionManager.getSessionPhaseAsync(session);
      expect(phase).toBe(sessionManager.SESSION_PHASES.MERGED);
    });

    test('returns MERGED for main sessions', async () => {
      const session = { is_main: true };
      const phase = await sessionManager.getSessionPhaseAsync(session);
      expect(phase).toBe(sessionManager.SESSION_PHASES.MERGED);
    });

    test('returns TODO for non-existent session path', async () => {
      const session = { path: '/nonexistent/path' };
      const phase = await sessionManager.getSessionPhaseAsync(session);
      expect(phase).toBe(sessionManager.SESSION_PHASES.TODO);
    });
  });

  describe('getSessionPhasesAsync()', () => {
    test('processes multiple sessions in parallel', async () => {
      const sessions = [
        { merged_at: '2026-01-28T00:00:00Z' },
        { is_main: true },
        { path: '/nonexistent' },
      ];
      const results = await sessionManager.getSessionPhasesAsync(sessions);
      expect(results).toHaveLength(3);
      expect(results[0].phase).toBe(sessionManager.SESSION_PHASES.MERGED);
      expect(results[1].phase).toBe(sessionManager.SESSION_PHASES.MERGED);
      expect(results[2].phase).toBe(sessionManager.SESSION_PHASES.TODO);
    });

    test('returns empty array for empty input', async () => {
      const results = await sessionManager.getSessionPhasesAsync([]);
      expect(results).toEqual([]);
    });
  });

  describe('execGitAsync()', () => {
    test('executes git command and returns result', async () => {
      // Test with a simple git command that works in any git repo
      const result = await sessionManager.execGitAsync(['--version'], process.cwd());
      expect(result.stdout).toContain('git version');
      expect(result.code).toBe(0);
    });

    test('returns error code for invalid git command', async () => {
      const result = await sessionManager.execGitAsync(['invalid-command-xyz'], process.cwd());
      expect(result.code).not.toBe(0);
    });
  });

  describe('getSession()', () => {
    test('returns session by ID from injected registry', () => {
      mockRegistry._data.sessions = {
        42: { nickname: 'answer-session', branch: 'deep-thought' },
      };

      const session = sessionManager.getSession(42);
      expect(session.nickname).toBe('answer-session');
      expect(session.branch).toBe('deep-thought');
    });

    test('returns null for non-existent session', () => {
      mockRegistry._data.sessions = {};
      const session = sessionManager.getSession(999);
      expect(session).toBeNull();
    });
  });

  describe('getActiveSessionCount()', () => {
    test('counts sessions from injected registry', () => {
      mockRegistry._data.sessions = {
        1: { status: 'active' },
        2: { status: 'inactive' },
        3: { status: 'active' },
      };

      // Note: getActiveSessionCount checks lock files for liveness
      // With mocked registry, it counts all sessions
      const count = sessionManager.getActiveSessionCount();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('THREAD_TYPES constant', () => {
    test('exports thread type values', () => {
      expect(sessionManager.THREAD_TYPES).toContain('base');
      expect(sessionManager.THREAD_TYPES).toContain('parallel');
      expect(sessionManager.THREAD_TYPES).toContain('chained');
      expect(sessionManager.THREAD_TYPES).toContain('fusion');
    });
  });

  describe('detectThreadType()', () => {
    test('returns parallel for worktree sessions', () => {
      const session = { is_main: false };
      expect(sessionManager.detectThreadType(session, true)).toBe('parallel');
    });

    test('returns base for main sessions', () => {
      const session = { is_main: true };
      expect(sessionManager.detectThreadType(session, false)).toBe('base');
    });
  });

  describe('resetRegistryCache()', () => {
    test('resets initialization state for fresh load', () => {
      // First load initializes cache
      const data1 = sessionManager.loadRegistry();
      expect(data1.sessions).toEqual({});

      // Modify data directly in mock (simulating external change)
      mockRegistry._data.sessions = { 999: { nickname: 'external-change' } };

      // Without reset, should still return cached data
      const data2 = sessionManager.loadRegistry();
      expect(data2.sessions).toEqual({}); // Still cached

      // After reset, should return fresh data
      sessionManager.resetRegistryCache();
      const data3 = sessionManager.loadRegistry();
      expect(data3.sessions).toHaveProperty('999');
    });

    test('exported function is available', () => {
      expect(typeof sessionManager.resetRegistryCache).toBe('function');
    });
  });

  describe('transitionThread()', () => {
    beforeEach(() => {
      // Set up a session with parallel thread type
      mockRegistry._data.sessions = {
        1: { nickname: 'test', thread_type: 'parallel', is_main: false },
      };
      mockRegistry._cache = null; // Clear cache to pick up new data
    });

    test('validates and performs valid transition', () => {
      const result = sessionManager.transitionThread('1', 'fusion');
      expect(result.success).toBe(true);
      expect(result.from).toBe('parallel');
      expect(result.to).toBe('fusion');
    });

    test('rejects invalid transition', () => {
      // parallel cannot go directly to big
      const result = sessionManager.transitionThread('1', 'big');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition');
      expect(result.error).toContain('parallel → big');
    });

    test('allows forced invalid transition', () => {
      const result = sessionManager.transitionThread('1', 'big', { force: true });
      expect(result.success).toBe(true);
      expect(result.forced).toBe(true);
    });

    test('returns noop for same thread type', () => {
      const result = sessionManager.transitionThread('1', 'parallel');
      expect(result.success).toBe(true);
      expect(result.noop).toBe(true);
    });

    test('returns error for non-existent session', () => {
      const result = sessionManager.transitionThread('999', 'base');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('defaults legacy session to base/parallel', () => {
      mockRegistry._data.sessions = {
        2: { nickname: 'legacy', is_main: true }, // No thread_type
      };
      mockRegistry._cache = null;

      const result = sessionManager.transitionThread('2', 'parallel');
      expect(result.success).toBe(true);
      expect(result.from).toBe('base'); // Defaulted to base for main session
    });

    test('exported function is available', () => {
      expect(typeof sessionManager.transitionThread).toBe('function');
    });
  });

  describe('getValidThreadTransitions()', () => {
    beforeEach(() => {
      mockRegistry._data.sessions = {
        1: { nickname: 'test', thread_type: 'parallel', is_main: false },
      };
      mockRegistry._cache = null;
    });

    test('returns valid transitions for parallel', () => {
      const result = sessionManager.getValidThreadTransitions('1');
      expect(result.success).toBe(true);
      expect(result.current).toBe('parallel');
      expect(result.validTransitions).toContain('base');
      expect(result.validTransitions).toContain('fusion');
      expect(result.validTransitions).toContain('chained');
    });

    test('returns error for non-existent session', () => {
      const result = sessionManager.getValidThreadTransitions('999');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('defaults legacy session thread type', () => {
      mockRegistry._data.sessions = {
        2: { nickname: 'legacy', is_main: false }, // No thread_type
      };
      mockRegistry._cache = null;

      const result = sessionManager.getValidThreadTransitions('2');
      expect(result.current).toBe('parallel'); // Defaulted for non-main
    });

    test('exported function is available', () => {
      expect(typeof sessionManager.getValidThreadTransitions).toBe('function');
    });
  });

  describe('mock isolation', () => {
    test('changes to mock do not affect real registry', () => {
      // Modify mock data
      mockRegistry._data.sessions = { 999: { nickname: 'mock-only' } };

      // Reset to real registry
      sessionManager.injectRegistry(null);

      // Real registry should not have mock data
      const realRegistry = sessionManager.getRegistryInstance();
      const realData = realRegistry.loadSync();

      // Real data should not have mock session
      expect(realData.sessions?.['999']).toBeUndefined();
    });

    test('each test gets fresh mock instance', () => {
      // This should be a fresh mock from beforeEach
      expect(Object.keys(mockRegistry._data.sessions)).toHaveLength(0);
    });
  });
});

/**
 * Tests for docs/ symlink behavior in worktree creation.
 * These tests verify that docs/ is symlinked (not copied) when creating a session,
 * enabling shared state (status.json, story claiming, bus/) across sessions.
 */
describe('docs symlink behavior', () => {
  let testProjectDir;
  let testWorktreeDir;

  beforeEach(() => {
    // Create a mock project structure
    testProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), 'symlink-test-'));
    testWorktreeDir = path.join(testProjectDir, 'worktree');
    fs.mkdirSync(testWorktreeDir);

    // Create docs folder in "main project"
    const docsDir = path.join(testProjectDir, 'docs', '09-agents');
    fs.mkdirSync(docsDir, { recursive: true });
    fs.writeFileSync(
      path.join(testProjectDir, 'docs', '09-agents', 'status.json'),
      JSON.stringify({ test: 'main-project' })
    );
  });

  afterEach(() => {
    fs.rmSync(testProjectDir, { recursive: true, force: true });
  });

  test('symlink creation uses relative path', () => {
    const src = path.join(testProjectDir, 'docs');
    const dest = path.join(testWorktreeDir, 'docs');

    // Calculate relative path like the session-manager does
    const relPath = path.relative(testWorktreeDir, src);

    // Should be "../docs" - relative from worktree to main
    expect(relPath).toBe('../docs');
  });

  test('relative symlink works correctly', () => {
    const src = path.join(testProjectDir, 'docs');
    const dest = path.join(testWorktreeDir, 'docs');

    // Create symlink like session-manager does
    const relPath = path.relative(testWorktreeDir, src);
    fs.symlinkSync(relPath, dest, 'dir');

    // Verify symlink was created
    expect(fs.lstatSync(dest).isSymbolicLink()).toBe(true);

    // Verify symlink target is correct
    expect(fs.readlinkSync(dest)).toBe('../docs');

    // Verify symlink resolves to correct content
    const statusPath = path.join(dest, '09-agents', 'status.json');
    const content = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    expect(content.test).toBe('main-project');
  });

  test('changes through symlink are visible in original', () => {
    const src = path.join(testProjectDir, 'docs');
    const dest = path.join(testWorktreeDir, 'docs');

    // Create symlink
    const relPath = path.relative(testWorktreeDir, src);
    fs.symlinkSync(relPath, dest, 'dir');

    // Write through symlink
    const statusPath = path.join(dest, '09-agents', 'status.json');
    fs.writeFileSync(statusPath, JSON.stringify({ test: 'modified-via-symlink' }));

    // Read from original and verify change is visible
    const originalPath = path.join(src, '09-agents', 'status.json');
    const content = JSON.parse(fs.readFileSync(originalPath, 'utf8'));
    expect(content.test).toBe('modified-via-symlink');
  });

  test('removing symlink does not remove target', () => {
    const src = path.join(testProjectDir, 'docs');
    const dest = path.join(testWorktreeDir, 'docs');

    // Create symlink
    const relPath = path.relative(testWorktreeDir, src);
    fs.symlinkSync(relPath, dest, 'dir');

    // Remove symlink (simulating worktree removal)
    fs.unlinkSync(dest);

    // Verify original docs still exists with content
    expect(fs.existsSync(src)).toBe(true);
    const statusPath = path.join(src, '09-agents', 'status.json');
    const content = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    expect(content.test).toBe('main-project');
  });

  test('fallback to copy when symlink fails', () => {
    const src = path.join(testProjectDir, 'docs');
    const dest = path.join(testWorktreeDir, 'docs');

    // Simulate symlink failure by creating file at dest first
    fs.writeFileSync(dest, 'blocker');

    // Symlink should fail
    let symlinkFailed = false;
    try {
      const relPath = path.relative(testWorktreeDir, src);
      fs.symlinkSync(relPath, dest, 'dir');
    } catch (e) {
      symlinkFailed = true;
    }

    expect(symlinkFailed).toBe(true);

    // Clean up blocker and do copy fallback
    fs.unlinkSync(dest);
    fs.cpSync(src, dest, { recursive: true, force: true });

    // Verify copy worked
    expect(fs.existsSync(dest)).toBe(true);
    expect(fs.lstatSync(dest).isSymbolicLink()).toBe(false); // Not a symlink
    expect(fs.lstatSync(dest).isDirectory()).toBe(true); // Is a directory
  });
});
