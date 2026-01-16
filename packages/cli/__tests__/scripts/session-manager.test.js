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
