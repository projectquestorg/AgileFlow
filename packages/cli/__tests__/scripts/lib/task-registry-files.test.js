/**
 * Tests for file modification tracking in task-registry.js (US-0352)
 *
 * Covers:
 * - _getGitHead: returns hash, returns null on error
 * - _getModifiedFiles: returns sorted files, returns [] on error, handles null sinceRef
 * - _emitTaskCompleted: calls trackEvent with correct shape, fails open on error
 * - Integration: task start captures start_ref, task complete captures files_modified
 * - Fail-open: git errors don't break task state transitions
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const childProcess = require('child_process');

const {
  _getGitHead,
  _getModifiedFiles,
  _emitTaskCompleted,
  TaskRegistry,
} = require('../../../scripts/lib/task-registry');

// Test directory setup
let testDir;

beforeEach(() => {
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-registry-files-'));
  fs.mkdirSync(path.join(testDir, '.agileflow', 'state'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(testDir, { recursive: true, force: true });
});

// ============================================================================
// _getGitHead
// ============================================================================

describe('_getGitHead', () => {
  test('returns commit hash in a git repo', () => {
    // Use the real repo root for this test
    const repoRoot = path.resolve(__dirname, '..', '..', '..');
    const result = _getGitHead(repoRoot);
    expect(result).toBeTruthy();
    expect(result).toMatch(/^[0-9a-f]{40}$/);
  });

  test('returns null when not in a git repo', () => {
    const result = _getGitHead(testDir);
    expect(result).toBeNull();
  });

  test('returns null on error (fail-open)', () => {
    const result = _getGitHead('/nonexistent/path');
    expect(result).toBeNull();
  });
});

// ============================================================================
// _getModifiedFiles
// ============================================================================

describe('_getModifiedFiles', () => {
  test('returns [] when sinceRef is null', () => {
    const result = _getModifiedFiles(testDir, null);
    expect(result).toEqual([]);
  });

  test('returns [] when sinceRef is undefined', () => {
    const result = _getModifiedFiles(testDir, undefined);
    expect(result).toEqual([]);
  });

  test('returns [] on error (not a git repo)', () => {
    const result = _getModifiedFiles(testDir, 'abc123');
    expect(result).toEqual([]);
  });

  test('returns sorted deduplicated files from git diff', () => {
    // Initialize a git repo in testDir, create commits, modify files
    childProcess.execFileSync('git', ['init'], { cwd: testDir, stdio: 'pipe' });
    childProcess.execFileSync('git', ['config', 'user.email', 'test@test.com'], {
      cwd: testDir,
      stdio: 'pipe',
    });
    childProcess.execFileSync('git', ['config', 'user.name', 'Test'], {
      cwd: testDir,
      stdio: 'pipe',
    });

    // Create initial commit
    fs.writeFileSync(path.join(testDir, 'file-a.js'), 'a');
    fs.writeFileSync(path.join(testDir, 'file-b.js'), 'b');
    childProcess.execFileSync('git', ['add', '.'], { cwd: testDir, stdio: 'pipe' });
    childProcess.execFileSync('git', ['commit', '-m', 'initial'], { cwd: testDir, stdio: 'pipe' });

    const startRef = childProcess
      .execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: testDir,
        encoding: 'utf8',
        stdio: 'pipe',
      })
      .trim();

    // Modify files
    fs.writeFileSync(path.join(testDir, 'file-a.js'), 'a-modified');
    fs.writeFileSync(path.join(testDir, 'file-b.js'), 'b-modified');
    childProcess.execFileSync('git', ['add', '.'], { cwd: testDir, stdio: 'pipe' });
    childProcess.execFileSync('git', ['commit', '-m', 'modify'], { cwd: testDir, stdio: 'pipe' });

    const result = _getModifiedFiles(testDir, startRef);
    expect(result).toEqual(['file-a.js', 'file-b.js']);
  });

  test('returns [] when no files changed', () => {
    childProcess.execFileSync('git', ['init'], { cwd: testDir, stdio: 'pipe' });
    childProcess.execFileSync('git', ['config', 'user.email', 'test@test.com'], {
      cwd: testDir,
      stdio: 'pipe',
    });
    childProcess.execFileSync('git', ['config', 'user.name', 'Test'], {
      cwd: testDir,
      stdio: 'pipe',
    });

    fs.writeFileSync(path.join(testDir, 'file.js'), 'content');
    childProcess.execFileSync('git', ['add', '.'], { cwd: testDir, stdio: 'pipe' });
    childProcess.execFileSync('git', ['commit', '-m', 'initial'], { cwd: testDir, stdio: 'pipe' });

    const headRef = childProcess
      .execFileSync('git', ['rev-parse', 'HEAD'], {
        cwd: testDir,
        encoding: 'utf8',
        stdio: 'pipe',
      })
      .trim();

    const result = _getModifiedFiles(testDir, headRef);
    expect(result).toEqual([]);
  });
});

// ============================================================================
// _emitTaskCompleted
// ============================================================================

describe('_emitTaskCompleted', () => {
  let mockTrackEvent;

  beforeEach(() => {
    // Mock team-events module
    mockTrackEvent = jest.fn().mockReturnValue({ ok: true });
    jest.mock(
      '../../../scripts/lib/team-events',
      () => ({
        trackEvent: mockTrackEvent,
      }),
      { virtual: false }
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.resetModules();
  });

  test('calls trackEvent with correct shape', () => {
    const task = {
      id: 'task-123',
      subagent_type: 'api',
      story_id: 'US-0352',
      metadata: {
        trace_id: 'trace-abc',
        files_modified: ['file-a.js', 'file-b.js'],
        started_at: new Date(Date.now() - 5000).toISOString(),
      },
    };

    // Re-require to pick up the mock
    jest.resetModules();
    const { _emitTaskCompleted: emit } = require('../../../scripts/lib/task-registry');
    emit(testDir, task);

    const te = require('../../../scripts/lib/team-events');
    expect(te.trackEvent).toHaveBeenCalledTimes(1);
    const [rootDir, eventType, data] = te.trackEvent.mock.calls[0];
    expect(rootDir).toBe(testDir);
    expect(eventType).toBe('task_completed');
    expect(data.agent).toBe('api');
    expect(data.task_id).toBe('task-123');
    expect(data.story_id).toBe('US-0352');
    expect(data.trace_id).toBe('trace-abc');
    expect(data.files_modified).toEqual(['file-a.js', 'file-b.js']);
    expect(typeof data.duration_ms).toBe('number');
    expect(data.duration_ms).toBeGreaterThanOrEqual(0);
  });

  test('uses "unknown" when subagent_type is null', () => {
    const task = {
      id: 'task-456',
      subagent_type: null,
      story_id: null,
      metadata: {},
    };

    jest.resetModules();
    const { _emitTaskCompleted: emit } = require('../../../scripts/lib/task-registry');
    emit(testDir, task);

    const te = require('../../../scripts/lib/team-events');
    expect(te.trackEvent).toHaveBeenCalledTimes(1);
    expect(te.trackEvent.mock.calls[0][2].agent).toBe('unknown');
    expect(te.trackEvent.mock.calls[0][2].duration_ms).toBeNull();
  });

  test('fails open when team-events throws', () => {
    jest.resetModules();
    jest.mock('../../../scripts/lib/team-events', () => ({
      trackEvent: () => {
        throw new Error('boom');
      },
    }));
    const { _emitTaskCompleted: emit } = require('../../../scripts/lib/task-registry');

    // Should not throw
    expect(() => emit(testDir, { id: 'x', metadata: {} })).not.toThrow();
  });
});

// ============================================================================
// Integration: state transitions capture file tracking data
// ============================================================================

describe('file tracking integration', () => {
  let registry;

  beforeEach(() => {
    registry = new TaskRegistry({
      rootDir: testDir,
      statePath: '.agileflow/state/task-dependencies.json',
      forceNew: true,
    });
  });

  test('start() captures start_ref and started_at in metadata', () => {
    // Create and start a task
    const { task } = registry.create({
      description: 'test task',
      subagent_type: 'api',
      metadata: {},
    });

    const result = registry.start(task.id);
    expect(result.success).toBe(true);

    const updated = registry.get(task.id);
    // start_ref will be null since testDir is not a git repo, but the key should exist
    expect(updated.metadata).toHaveProperty('start_ref');
    expect(updated.metadata).toHaveProperty('started_at');
    expect(typeof updated.metadata.started_at).toBe('string');
  });

  test('complete() captures files_modified in metadata', () => {
    const { task } = registry.create({
      description: 'test task',
      subagent_type: 'api',
      metadata: {},
    });

    registry.start(task.id);
    const result = registry.complete(task.id, 'done');
    expect(result.success).toBe(true);

    const updated = registry.get(task.id);
    expect(updated.metadata).toHaveProperty('files_modified');
    expect(Array.isArray(updated.metadata.files_modified)).toBe(true);
  });

  test('git errors do not break state transitions', () => {
    const { task } = registry.create({
      description: 'test task',
      subagent_type: 'testing',
      metadata: {},
    });

    // start and complete should both succeed even in non-git dir
    expect(registry.start(task.id).success).toBe(true);
    expect(registry.complete(task.id, 'ok').success).toBe(true);

    const final = registry.get(task.id);
    expect(final.state).toBe('completed');
    expect(final.metadata.start_ref).toBeNull();
    expect(final.metadata.files_modified).toEqual([]);
  });

  test('full lifecycle with git repo captures files', () => {
    // Set up a git repo in testDir
    childProcess.execFileSync('git', ['init'], { cwd: testDir, stdio: 'pipe' });
    childProcess.execFileSync('git', ['config', 'user.email', 'test@test.com'], {
      cwd: testDir,
      stdio: 'pipe',
    });
    childProcess.execFileSync('git', ['config', 'user.name', 'Test'], {
      cwd: testDir,
      stdio: 'pipe',
    });

    // Create a file and make initial commit
    fs.writeFileSync(path.join(testDir, 'README.md'), '# test');
    childProcess.execFileSync('git', ['add', 'README.md'], { cwd: testDir, stdio: 'pipe' });
    childProcess.execFileSync('git', ['commit', '-m', 'initial'], { cwd: testDir, stdio: 'pipe' });

    // Reload registry so it sees the git repo
    registry = new TaskRegistry({
      rootDir: testDir,
      statePath: '.agileflow/state/task-dependencies.json',
      forceNew: true,
    });

    const { task } = registry.create({
      description: 'modify files',
      subagent_type: 'ui',
      metadata: {},
    });

    // Start task - captures start_ref
    registry.start(task.id);
    const started = registry.get(task.id);
    expect(started.metadata.start_ref).toMatch(/^[0-9a-f]{40}$/);

    // Simulate agent modifying a file and committing
    fs.writeFileSync(path.join(testDir, 'component.tsx'), 'export default () => <div/>');
    childProcess.execFileSync('git', ['add', 'component.tsx'], { cwd: testDir, stdio: 'pipe' });
    childProcess.execFileSync('git', ['commit', '-m', 'add component'], {
      cwd: testDir,
      stdio: 'pipe',
    });

    // Complete task - captures files_modified
    const result = registry.complete(task.id, 'done');
    expect(result.success).toBe(true);

    const completed = registry.get(task.id);
    expect(completed.metadata.files_modified).toContain('component.tsx');
  });
});
