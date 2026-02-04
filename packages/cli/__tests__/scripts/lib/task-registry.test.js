/**
 * Tests for task-registry.js - Multi-Agent Task Orchestration System
 *
 * Coverage targets:
 * - 100% state machine transitions
 * - 95% DAG validation
 * - Atomic writes and lock handling
 * - CRUD operations
 * - Dependency management
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  // Constants
  TASK_STATES,
  TERMINAL_STATES,
  DONE_STATES,
  TRANSITIONS,
  JOIN_STRATEGIES,
  FAILURE_POLICIES,

  // State machine
  isValidState,
  isValidTransition,
  getValidTransitions,
  isTerminalState,

  // DAG validation
  detectCycle,
  validateDAG,
  topologicalSort,

  // Utilities
  generateTaskId,
  atomicWrite,

  // Classes
  TaskRegistry,
  FileLock,

  // Factory
  getTaskRegistry,
  resetTaskRegistry,
} = require('../../../scripts/lib/task-registry');

// Test directory setup
let testDir;
let registry;

beforeEach(() => {
  // Create isolated test directory
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'task-registry-test-'));
  fs.mkdirSync(path.join(testDir, '.agileflow', 'state'), { recursive: true });

  // Reset singleton
  resetTaskRegistry();

  // Create fresh registry for each test
  registry = new TaskRegistry({ rootDir: testDir });
});

afterEach(() => {
  // Cleanup test directory
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore cleanup errors
  }
});

// ============================================================================
// Constants Tests
// ============================================================================

describe('Constants', () => {
  describe('TASK_STATES', () => {
    it('includes all expected states', () => {
      expect(TASK_STATES).toContain('queued');
      expect(TASK_STATES).toContain('running');
      expect(TASK_STATES).toContain('completed');
      expect(TASK_STATES).toContain('failed');
      expect(TASK_STATES).toContain('blocked');
      expect(TASK_STATES).toContain('cancelled');
    });

    it('has 6 states', () => {
      expect(TASK_STATES).toHaveLength(6);
    });
  });

  describe('TERMINAL_STATES', () => {
    it('includes completed and cancelled', () => {
      expect(TERMINAL_STATES).toContain('completed');
      expect(TERMINAL_STATES).toContain('cancelled');
    });

    it('does not include failed (can retry)', () => {
      expect(TERMINAL_STATES).not.toContain('failed');
    });
  });

  describe('DONE_STATES', () => {
    it('includes completed, failed, and cancelled', () => {
      expect(DONE_STATES).toContain('completed');
      expect(DONE_STATES).toContain('failed');
      expect(DONE_STATES).toContain('cancelled');
    });
  });

  describe('TRANSITIONS', () => {
    it('allows queued → running', () => {
      expect(TRANSITIONS.queued).toContain('running');
    });

    it('allows queued → blocked', () => {
      expect(TRANSITIONS.queued).toContain('blocked');
    });

    it('allows running → completed', () => {
      expect(TRANSITIONS.running).toContain('completed');
    });

    it('allows running → failed', () => {
      expect(TRANSITIONS.running).toContain('failed');
    });

    it('allows blocked → queued', () => {
      expect(TRANSITIONS.blocked).toContain('queued');
    });

    it('allows failed → queued (retry)', () => {
      expect(TRANSITIONS.failed).toContain('queued');
    });

    it('completed is terminal (no transitions)', () => {
      expect(TRANSITIONS.completed).toHaveLength(0);
    });

    it('cancelled is terminal (no transitions)', () => {
      expect(TRANSITIONS.cancelled).toHaveLength(0);
    });
  });

  describe('JOIN_STRATEGIES', () => {
    it('includes all expected strategies', () => {
      expect(JOIN_STRATEGIES).toContain('all');
      expect(JOIN_STRATEGIES).toContain('first');
      expect(JOIN_STRATEGIES).toContain('any');
      expect(JOIN_STRATEGIES).toContain('any-N');
      expect(JOIN_STRATEGIES).toContain('majority');
    });
  });

  describe('FAILURE_POLICIES', () => {
    it('includes all expected policies', () => {
      expect(FAILURE_POLICIES).toContain('fail-fast');
      expect(FAILURE_POLICIES).toContain('continue');
      expect(FAILURE_POLICIES).toContain('ignore');
    });
  });
});

// ============================================================================
// State Machine Tests
// ============================================================================

describe('State Machine', () => {
  describe('isValidState', () => {
    it.each(TASK_STATES)('returns true for valid state: %s', state => {
      expect(isValidState(state)).toBe(true);
    });

    it('returns false for invalid state', () => {
      expect(isValidState('invalid')).toBe(false);
      expect(isValidState('pending')).toBe(false);
      expect(isValidState('done')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isValidState(null)).toBe(false);
      expect(isValidState(undefined)).toBe(false);
    });
  });

  describe('isValidTransition', () => {
    it('returns true for same state (no-op)', () => {
      expect(isValidTransition('queued', 'queued')).toBe(true);
      expect(isValidTransition('completed', 'completed')).toBe(true);
    });

    it('returns true for valid transitions', () => {
      expect(isValidTransition('queued', 'running')).toBe(true);
      expect(isValidTransition('running', 'completed')).toBe(true);
      expect(isValidTransition('running', 'failed')).toBe(true);
      expect(isValidTransition('blocked', 'queued')).toBe(true);
    });

    it('returns false for invalid transitions', () => {
      expect(isValidTransition('queued', 'completed')).toBe(false);
      expect(isValidTransition('queued', 'failed')).toBe(false);
    });

    it('returns false for transitions from terminal states', () => {
      expect(isValidTransition('completed', 'running')).toBe(false);
      expect(isValidTransition('cancelled', 'queued')).toBe(false);
    });

    it('returns false for unknown state', () => {
      expect(isValidTransition('unknown', 'running')).toBe(false);
    });
  });

  describe('getValidTransitions', () => {
    it('returns valid transitions for queued', () => {
      const transitions = getValidTransitions('queued');
      expect(transitions).toContain('running');
      expect(transitions).toContain('blocked');
      expect(transitions).toContain('cancelled');
      expect(transitions).not.toContain('completed');
    });

    it('returns empty array for completed', () => {
      expect(getValidTransitions('completed')).toEqual([]);
    });

    it('returns empty array for unknown state', () => {
      expect(getValidTransitions('unknown')).toEqual([]);
    });
  });

  describe('isTerminalState', () => {
    it('returns true for terminal states', () => {
      expect(isTerminalState('completed')).toBe(true);
      expect(isTerminalState('cancelled')).toBe(true);
    });

    it('returns false for non-terminal states', () => {
      expect(isTerminalState('queued')).toBe(false);
      expect(isTerminalState('running')).toBe(false);
      expect(isTerminalState('failed')).toBe(false);
      expect(isTerminalState('blocked')).toBe(false);
    });
  });
});

// ============================================================================
// DAG Validation Tests
// ============================================================================

describe('DAG Validation', () => {
  describe('detectCycle', () => {
    it('returns no cycle for empty graph', () => {
      const result = detectCycle({}, 'task-1');
      expect(result.hasCycle).toBe(false);
    });

    it('returns no cycle for linear dependency', () => {
      const tasks = {
        'task-1': { id: 'task-1', blockedBy: [] },
        'task-2': { id: 'task-2', blockedBy: ['task-1'] },
        'task-3': { id: 'task-3', blockedBy: ['task-2'] },
      };
      const result = detectCycle(tasks, 'task-3');
      expect(result.hasCycle).toBe(false);
    });

    it('detects simple cycle', () => {
      const tasks = {
        'task-1': { id: 'task-1', blockedBy: ['task-2'] },
        'task-2': { id: 'task-2', blockedBy: ['task-1'] },
      };
      const result = detectCycle(tasks, 'task-1');
      expect(result.hasCycle).toBe(true);
      expect(result.cycle).toBeDefined();
    });

    it('detects cycle in complex graph', () => {
      const tasks = {
        'task-1': { id: 'task-1', blockedBy: [] },
        'task-2': { id: 'task-2', blockedBy: ['task-1'] },
        'task-3': { id: 'task-3', blockedBy: ['task-2'] },
        'task-4': { id: 'task-4', blockedBy: ['task-3', 'task-1'] },
      };
      // Add cycle: task-1 depends on task-4
      tasks['task-1'].blockedBy = ['task-4'];

      const result = detectCycle(tasks, 'task-1');
      expect(result.hasCycle).toBe(true);
    });
  });

  describe('validateDAG', () => {
    it('returns valid for empty graph', () => {
      const result = validateDAG({});
      expect(result.valid).toBe(true);
      expect(result.cycles).toHaveLength(0);
    });

    it('returns valid for acyclic graph', () => {
      const tasks = {
        'task-1': { id: 'task-1', blockedBy: [] },
        'task-2': { id: 'task-2', blockedBy: ['task-1'] },
        'task-3': { id: 'task-3', blockedBy: ['task-1', 'task-2'] },
      };
      const result = validateDAG(tasks);
      expect(result.valid).toBe(true);
    });

    it('returns invalid with cycles listed', () => {
      const tasks = {
        'task-1': { id: 'task-1', blockedBy: ['task-2'] },
        'task-2': { id: 'task-2', blockedBy: ['task-1'] },
      };
      const result = validateDAG(tasks);
      expect(result.valid).toBe(false);
      expect(result.cycles.length).toBeGreaterThan(0);
    });
  });

  describe('topologicalSort', () => {
    it('returns sorted order for acyclic graph', () => {
      const tasks = {
        'task-3': { id: 'task-3', blockedBy: ['task-2'] },
        'task-1': { id: 'task-1', blockedBy: [] },
        'task-2': { id: 'task-2', blockedBy: ['task-1'] },
      };
      const result = topologicalSort(tasks);
      expect(result.valid).toBe(true);
      expect(result.sorted).toHaveLength(3);

      // task-1 must come before task-2, task-2 before task-3
      const idx1 = result.sorted.indexOf('task-1');
      const idx2 = result.sorted.indexOf('task-2');
      const idx3 = result.sorted.indexOf('task-3');
      expect(idx1).toBeLessThan(idx2);
      expect(idx2).toBeLessThan(idx3);
    });

    it('returns invalid for cyclic graph', () => {
      const tasks = {
        'task-1': { id: 'task-1', blockedBy: ['task-2'] },
        'task-2': { id: 'task-2', blockedBy: ['task-1'] },
      };
      const result = topologicalSort(tasks);
      expect(result.valid).toBe(false);
    });

    it('handles independent tasks', () => {
      const tasks = {
        'task-1': { id: 'task-1', blockedBy: [] },
        'task-2': { id: 'task-2', blockedBy: [] },
        'task-3': { id: 'task-3', blockedBy: [] },
      };
      const result = topologicalSort(tasks);
      expect(result.valid).toBe(true);
      expect(result.sorted).toHaveLength(3);
    });
  });
});

// ============================================================================
// Utility Tests
// ============================================================================

describe('Utilities', () => {
  describe('generateTaskId', () => {
    it('generates unique IDs', () => {
      const id1 = generateTaskId();
      const id2 = generateTaskId();
      expect(id1).not.toBe(id2);
    });

    it('starts with task- prefix', () => {
      const id = generateTaskId();
      expect(id).toMatch(/^task-/);
    });

    it('has reasonable length', () => {
      const id = generateTaskId();
      expect(id.length).toBeGreaterThan(10);
      expect(id.length).toBeLessThan(30);
    });
  });

  describe('atomicWrite', () => {
    it('writes file atomically', () => {
      const filePath = path.join(testDir, 'test-file.json');
      const content = JSON.stringify({ test: true });

      atomicWrite(filePath, content);

      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf8')).toBe(content);
    });

    it('creates parent directories', () => {
      const filePath = path.join(testDir, 'nested', 'dir', 'test-file.json');
      const content = 'test content';

      atomicWrite(filePath, content);

      expect(fs.existsSync(filePath)).toBe(true);
    });

    it('overwrites existing file', () => {
      const filePath = path.join(testDir, 'test-file.json');

      atomicWrite(filePath, 'content1');
      atomicWrite(filePath, 'content2');

      expect(fs.readFileSync(filePath, 'utf8')).toBe('content2');
    });
  });
});

// ============================================================================
// FileLock Tests
// ============================================================================

describe('FileLock', () => {
  let lockPath;

  beforeEach(() => {
    lockPath = path.join(testDir, '.agileflow', 'state', 'test.lock');
  });

  it('acquires lock on first attempt', () => {
    const lock = new FileLock(lockPath);
    expect(lock.acquire()).toBe(true);
    expect(lock.held).toBe(true);
    lock.release();
  });

  it('releases lock correctly', () => {
    const lock = new FileLock(lockPath);
    lock.acquire();
    lock.release();

    expect(lock.held).toBe(false);
    expect(fs.existsSync(lockPath)).toBe(false);
  });

  it('creates lock file with process info', () => {
    const lock = new FileLock(lockPath);
    lock.acquire();

    const content = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    expect(content.pid).toBe(process.pid);
    expect(content.acquired).toBeDefined();

    lock.release();
  });

  it('handles stale lock cleanup', () => {
    // Create a stale lock file
    fs.mkdirSync(path.dirname(lockPath), { recursive: true });
    fs.writeFileSync(lockPath, JSON.stringify({ pid: 99999, acquired: '2020-01-01' }));

    // Backdate the file
    const pastTime = Date.now() - 120000; // 2 minutes ago
    fs.utimesSync(lockPath, new Date(pastTime), new Date(pastTime));

    const lock = new FileLock(lockPath, { staleMs: 60000 });
    expect(lock.acquire()).toBe(true);
    lock.release();
  });
});

// ============================================================================
// TaskRegistry CRUD Tests
// ============================================================================

describe('TaskRegistry', () => {
  describe('create', () => {
    it('creates a task with generated ID', () => {
      const result = registry.create({
        description: 'Test task',
        subagent_type: 'agileflow-api',
      });

      expect(result.success).toBe(true);
      expect(result.task.id).toMatch(/^task-/);
      expect(result.task.state).toBe('queued');
    });

    it('creates a task with custom ID', () => {
      const result = registry.create({
        id: 'custom-task-123',
        description: 'Custom ID task',
      });

      expect(result.success).toBe(true);
      expect(result.task.id).toBe('custom-task-123');
    });

    it('rejects duplicate ID', () => {
      registry.create({ id: 'task-1', description: 'First' });
      const result = registry.create({ id: 'task-1', description: 'Duplicate' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('already exists');
    });

    it('sets default values', () => {
      const result = registry.create({ description: 'Test' });

      expect(result.task.state).toBe('queued');
      expect(result.task.blockedBy).toEqual([]);
      expect(result.task.blocks).toEqual([]);
      expect(result.task.join_strategy).toBe('all');
      expect(result.task.on_failure).toBe('fail-fast');
    });

    it('auto-blocks task with unmet dependencies', () => {
      registry.create({ id: 'task-1', description: 'First' });
      const result = registry.create({
        id: 'task-2',
        description: 'Second',
        blockedBy: ['task-1'],
      });

      expect(result.task.state).toBe('blocked');
    });

    it('rejects circular dependency', () => {
      registry.create({
        id: 'task-1',
        description: 'First',
        blockedBy: ['task-2'],
      });
      const result = registry.create({
        id: 'task-2',
        description: 'Second',
        blockedBy: ['task-1'],
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('circular dependency');
    });

    it('updates reverse dependencies (blocks)', () => {
      registry.create({ id: 'task-1', description: 'First' });
      registry.create({
        id: 'task-2',
        description: 'Second',
        blockedBy: ['task-1'],
      });

      const task1 = registry.get('task-1');
      expect(task1.blocks).toContain('task-2');
    });

    it('emits created event', () => {
      const handler = jest.fn();
      registry.on('created', handler);

      registry.create({ description: 'Test' });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].task).toBeDefined();
    });
  });

  describe('get', () => {
    it('returns task by ID', () => {
      registry.create({ id: 'task-1', description: 'Test' });
      const task = registry.get('task-1');

      expect(task).toBeDefined();
      expect(task.description).toBe('Test');
    });

    it('returns null for unknown ID', () => {
      const task = registry.get('unknown');
      expect(task).toBeNull();
    });
  });

  describe('getAll', () => {
    beforeEach(() => {
      registry.create({ id: 'task-1', description: 'Task 1', subagent_type: 'agileflow-api' });
      registry.create({ id: 'task-2', description: 'Task 2', subagent_type: 'agileflow-ui' });
      registry.create({
        id: 'task-3',
        description: 'Task 3',
        subagent_type: 'agileflow-api',
        story_id: 'US-001',
      });
    });

    it('returns all tasks', () => {
      const tasks = registry.getAll();
      expect(tasks).toHaveLength(3);
    });

    it('filters by state', () => {
      registry.start('task-1');
      const tasks = registry.getAll({ state: 'running' });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-1');
    });

    it('filters by subagent_type', () => {
      const tasks = registry.getAll({ subagent_type: 'agileflow-api' });
      expect(tasks).toHaveLength(2);
    });

    it('filters by story_id', () => {
      const tasks = registry.getAll({ story_id: 'US-001' });
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-3');
    });
  });

  describe('update', () => {
    it('updates task fields', () => {
      registry.create({ id: 'task-1', description: 'Original' });
      const result = registry.update('task-1', { description: 'Updated' });

      expect(result.success).toBe(true);
      expect(result.task.description).toBe('Updated');
    });

    it('returns error for unknown task', () => {
      const result = registry.update('unknown', { description: 'Test' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('validates state transitions', () => {
      registry.create({ id: 'task-1', description: 'Test' });
      const result = registry.update('task-1', { state: 'completed' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition');
    });

    it('emits updated event', () => {
      registry.create({ id: 'task-1', description: 'Test' });

      const handler = jest.fn();
      registry.on('updated', handler);

      registry.update('task-1', { description: 'Updated' });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].changes).toContain('description');
    });
  });

  describe('delete', () => {
    it('deletes task', () => {
      registry.create({ id: 'task-1', description: 'Test' });
      const result = registry.delete('task-1');

      expect(result.success).toBe(true);
      expect(registry.get('task-1')).toBeNull();
    });

    it('removes from dependency lists', () => {
      registry.create({ id: 'task-1', description: 'First' });
      registry.create({
        id: 'task-2',
        description: 'Second',
        blockedBy: ['task-1'],
      });

      registry.delete('task-1');

      const task2 = registry.get('task-2');
      expect(task2.blockedBy).not.toContain('task-1');
    });

    it('returns error for unknown task', () => {
      const result = registry.delete('unknown');
      expect(result.success).toBe(false);
    });

    it('emits deleted event', () => {
      registry.create({ id: 'task-1', description: 'Test' });

      const handler = jest.fn();
      registry.on('deleted', handler);

      registry.delete('task-1');

      expect(handler).toHaveBeenCalledTimes(1);
    });
  });
});

// ============================================================================
// State Transition Tests
// ============================================================================

describe('State Transitions', () => {
  beforeEach(() => {
    registry.create({ id: 'task-1', description: 'Test task' });
  });

  describe('start', () => {
    it('transitions to running', () => {
      const result = registry.start('task-1');
      expect(result.success).toBe(true);
      expect(result.task.state).toBe('running');
    });
  });

  describe('complete', () => {
    it('transitions to completed with result', () => {
      registry.start('task-1');
      const result = registry.complete('task-1', { data: 'test result' });

      expect(result.success).toBe(true);
      expect(result.task.state).toBe('completed');
      expect(result.task.result).toEqual({ data: 'test result' });
    });

    it('cannot complete from queued', () => {
      const result = registry.complete('task-1');
      expect(result.success).toBe(false);
    });
  });

  describe('fail', () => {
    it('transitions to failed with error', () => {
      registry.start('task-1');
      const result = registry.fail('task-1', 'Something went wrong');

      expect(result.success).toBe(true);
      expect(result.task.state).toBe('failed');
      expect(result.task.error).toBe('Something went wrong');
    });
  });

  describe('block', () => {
    it('transitions to blocked with reason', () => {
      registry.start('task-1');
      const result = registry.block('task-1', 'Waiting for dependency');

      expect(result.success).toBe(true);
      expect(result.task.state).toBe('blocked');
    });
  });

  describe('cancel', () => {
    it('transitions to cancelled', () => {
      const result = registry.cancel('task-1', 'No longer needed');
      expect(result.success).toBe(true);
      expect(result.task.state).toBe('cancelled');
    });
  });

  describe('retry', () => {
    it('transitions failed to queued', () => {
      registry.start('task-1');
      registry.fail('task-1', 'Error');

      const result = registry.retry('task-1');

      expect(result.success).toBe(true);
      expect(result.task.state).toBe('queued');
    });

    it('rejects retry for non-failed task', () => {
      const result = registry.retry('task-1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('only retry failed');
    });
  });
});

// ============================================================================
// Dependency Management Tests
// ============================================================================

describe('Dependency Management', () => {
  beforeEach(() => {
    registry.create({ id: 'task-1', description: 'First' });
    registry.create({ id: 'task-2', description: 'Second' });
  });

  describe('addDependency', () => {
    it('adds blockedBy dependency', () => {
      const result = registry.addDependency('task-2', 'task-1');
      expect(result.success).toBe(true);

      const task2 = registry.get('task-2');
      expect(task2.blockedBy).toContain('task-1');
    });

    it('rejects circular dependency', () => {
      registry.addDependency('task-2', 'task-1');
      const result = registry.addDependency('task-1', 'task-2');

      expect(result.success).toBe(false);
      expect(result.error).toContain('circular');
    });
  });

  describe('removeDependency', () => {
    it('removes blockedBy dependency', () => {
      registry.addDependency('task-2', 'task-1');
      const result = registry.removeDependency('task-2', 'task-1');

      expect(result.success).toBe(true);
      const task2 = registry.get('task-2');
      expect(task2.blockedBy).not.toContain('task-1');
    });
  });

  describe('getReadyTasks', () => {
    it('returns tasks with no unmet dependencies', () => {
      registry.create({
        id: 'task-3',
        description: 'Third',
        blockedBy: ['task-1'],
      });

      const ready = registry.getReadyTasks();
      expect(ready.map(t => t.id)).toContain('task-1');
      expect(ready.map(t => t.id)).toContain('task-2');
      expect(ready.map(t => t.id)).not.toContain('task-3');
    });

    it('includes task after dependency completes', () => {
      registry.create({
        id: 'task-3',
        description: 'Third',
        blockedBy: ['task-1'],
      });

      registry.start('task-1');
      registry.complete('task-1');

      const ready = registry.getReadyTasks();
      expect(ready.map(t => t.id)).toContain('task-3');
    });
  });

  describe('auto-unblock on completion', () => {
    it('unblocks dependent task when blocker completes', () => {
      registry.create({
        id: 'task-3',
        description: 'Blocked task',
        blockedBy: ['task-1'],
      });

      expect(registry.get('task-3').state).toBe('blocked');

      registry.start('task-1');
      registry.complete('task-1');

      expect(registry.get('task-3').state).toBe('queued');
    });

    it('emits unblocked event', () => {
      registry.create({
        id: 'task-3',
        description: 'Blocked task',
        blockedBy: ['task-1'],
      });

      const handler = jest.fn();
      registry.on('unblocked', handler);

      registry.start('task-1');
      registry.complete('task-1');

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].task.id).toBe('task-3');
    });

    it('does not unblock if other dependencies remain', () => {
      registry.create({
        id: 'task-3',
        description: 'Multi-blocked',
        blockedBy: ['task-1', 'task-2'],
      });

      registry.start('task-1');
      registry.complete('task-1');

      expect(registry.get('task-3').state).toBe('blocked');
    });
  });

  describe('getDependencyGraph', () => {
    it('returns nodes and edges', () => {
      registry.create({
        id: 'task-3',
        description: 'Third',
        blockedBy: ['task-1', 'task-2'],
      });

      const graph = registry.getDependencyGraph();

      expect(graph.nodes).toHaveLength(3);
      expect(graph.edges).toHaveLength(2);
      expect(graph.edges).toContainEqual({ from: 'task-1', to: 'task-3' });
      expect(graph.edges).toContainEqual({ from: 'task-2', to: 'task-3' });
    });
  });
});

// ============================================================================
// Task Groups Tests
// ============================================================================

describe('Task Groups', () => {
  describe('createGroup', () => {
    it('creates a task group', () => {
      registry.create({ id: 'task-1', description: 'First' });
      registry.create({ id: 'task-2', description: 'Second' });

      const result = registry.createGroup({
        name: 'Test Group',
        task_ids: ['task-1', 'task-2'],
        join_strategy: 'all',
      });

      expect(result.success).toBe(true);
      expect(result.group.name).toBe('Test Group');
      expect(result.group.task_ids).toHaveLength(2);
    });

    it('rejects duplicate group ID', () => {
      registry.createGroup({ id: 'group-1', name: 'First' });
      const result = registry.createGroup({ id: 'group-1', name: 'Duplicate' });

      expect(result.success).toBe(false);
    });
  });

  describe('getGroupStatus', () => {
    it('returns group status with counts', () => {
      registry.create({ id: 'task-1', description: 'First' });
      registry.create({ id: 'task-2', description: 'Second' });
      registry.createGroup({
        id: 'group-1',
        task_ids: ['task-1', 'task-2'],
      });

      registry.start('task-1');
      registry.complete('task-1');

      const status = registry.getGroupStatus('group-1');

      expect(status.total).toBe(2);
      expect(status.completed).toBe(1);
      expect(status.running).toBe(0);
      expect(status.pending).toBe(1);
    });

    it('returns null for unknown group', () => {
      expect(registry.getGroupStatus('unknown')).toBeNull();
    });
  });
});

// ============================================================================
// Metrics & Queries Tests
// ============================================================================

describe('Metrics & Queries', () => {
  beforeEach(() => {
    registry.create({ id: 'task-1', subagent_type: 'agileflow-api', story_id: 'US-001' });
    registry.create({ id: 'task-2', subagent_type: 'agileflow-api' });
    registry.create({ id: 'task-3', subagent_type: 'agileflow-ui' });
  });

  describe('getStats', () => {
    it('returns task statistics', () => {
      registry.start('task-1');
      registry.complete('task-1');
      registry.start('task-2');
      registry.fail('task-2', 'Error');

      const stats = registry.getStats();

      expect(stats.total).toBe(3);
      expect(stats.by_state.completed).toBe(1);
      expect(stats.by_state.failed).toBe(1);
      expect(stats.by_state.queued).toBe(1);
      expect(stats.by_agent['agileflow-api']).toBe(2);
      expect(stats.by_agent['agileflow-ui']).toBe(1);
    });
  });

  describe('getTasksForStory', () => {
    it('returns tasks for a story', () => {
      const tasks = registry.getTasksForStory('US-001');
      expect(tasks).toHaveLength(1);
      expect(tasks[0].id).toBe('task-1');
    });
  });

  describe('getAuditTrail', () => {
    it('returns transition history', () => {
      registry.start('task-1');
      registry.complete('task-1');

      const trail = registry.getAuditTrail();
      expect(trail).toHaveLength(2);
    });

    it('filters by task_id', () => {
      registry.start('task-1');
      registry.start('task-2');

      const trail = registry.getAuditTrail({ task_id: 'task-1' });
      expect(trail).toHaveLength(1);
      expect(trail[0].task_id).toBe('task-1');
    });
  });

  describe('cleanup', () => {
    it('removes old completed tasks', () => {
      registry.start('task-1');
      registry.complete('task-1');

      // Manually backdate the task
      const state = registry.load();
      state.tasks['task-1'].updated_at = '2020-01-01T00:00:00.000Z';
      registry.save();

      const result = registry.cleanup(1000); // 1 second threshold
      expect(result.cleared).toBe(1);
      expect(registry.get('task-1')).toBeNull();
    });

    it('does not remove active tasks', () => {
      registry.start('task-1');

      const result = registry.cleanup(1000);
      expect(result.cleared).toBe(0);
      expect(registry.get('task-1')).not.toBeNull();
    });
  });
});

// ============================================================================
// Persistence Tests
// ============================================================================

describe('Persistence', () => {
  it('persists tasks to disk', () => {
    registry.create({ id: 'task-1', description: 'Persistent' });

    // Create new registry instance
    const registry2 = new TaskRegistry({ rootDir: testDir });
    const task = registry2.get('task-1');

    expect(task).toBeDefined();
    expect(task.description).toBe('Persistent');
  });

  it('creates default state on first load', () => {
    const state = registry.load();

    expect(state.schema_version).toBe('1.0.0');
    expect(state.tasks).toEqual({});
    expect(state.task_groups).toEqual({});
  });

  it('handles corrupted state gracefully', () => {
    // Write invalid JSON
    const statePath = path.join(testDir, '.agileflow', 'state', 'task-dependencies.json');
    fs.writeFileSync(statePath, 'invalid json');

    const state = registry.load();
    expect(state.schema_version).toBe('1.0.0');
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('Integration: Full Workflow', () => {
  it('completes multi-task parallel workflow', () => {
    // Create parallel tasks
    registry.create({ id: 'api-task', subagent_type: 'agileflow-api' });
    registry.create({ id: 'ui-task', subagent_type: 'agileflow-ui' });

    // Create task that depends on both
    registry.create({
      id: 'integration-task',
      subagent_type: 'agileflow-testing',
      blockedBy: ['api-task', 'ui-task'],
    });

    // Verify integration task is blocked
    expect(registry.get('integration-task').state).toBe('blocked');

    // Complete api-task
    registry.start('api-task');
    registry.complete('api-task', { endpoint: '/api/users' });

    // Still blocked (ui-task not done)
    expect(registry.get('integration-task').state).toBe('blocked');

    // Complete ui-task
    registry.start('ui-task');
    registry.complete('ui-task', { component: 'UserList' });

    // Now unblocked
    expect(registry.get('integration-task').state).toBe('queued');

    // Complete integration task
    registry.start('integration-task');
    registry.complete('integration-task', { tests_passed: true });

    // Verify final state
    const stats = registry.getStats();
    expect(stats.by_state.completed).toBe(3);

    // Verify audit trail
    const trail = registry.getAuditTrail();
    expect(trail.length).toBeGreaterThanOrEqual(6);
  });

  it('handles retry flow', () => {
    registry.create({ id: 'flaky-task', description: 'Might fail' });

    // First attempt fails
    registry.start('flaky-task');
    registry.fail('flaky-task', 'Network error');

    expect(registry.get('flaky-task').state).toBe('failed');

    // Retry
    registry.retry('flaky-task');
    expect(registry.get('flaky-task').state).toBe('queued');

    // Second attempt succeeds
    registry.start('flaky-task');
    registry.complete('flaky-task', { success: true });

    expect(registry.get('flaky-task').state).toBe('completed');
  });
});

// ============================================================================
// Singleton Factory Tests
// ============================================================================

describe('Singleton Factory', () => {
  it('returns same instance', () => {
    const r1 = getTaskRegistry({ rootDir: testDir });
    const r2 = getTaskRegistry();

    expect(r1).toBe(r2);
  });

  it('creates new instance with forceNew', () => {
    const r1 = getTaskRegistry({ rootDir: testDir });
    const r2 = getTaskRegistry({ rootDir: testDir, forceNew: true });

    expect(r1).not.toBe(r2);
  });

  it('resetTaskRegistry clears singleton', () => {
    const r1 = getTaskRegistry({ rootDir: testDir });
    resetTaskRegistry();
    const r2 = getTaskRegistry({ rootDir: testDir });

    expect(r1).not.toBe(r2);
  });
});

// ============================================================================
// Additional Edge Case Tests
// ============================================================================

describe('Edge Cases', () => {
  describe('FileLock timeout', () => {
    it('returns false when lock cannot be acquired within timeout', () => {
      // Create a fresh lock that will be held
      const lockPath = path.join(testDir, '.agileflow', 'state', 'timeout-test.lock');
      fs.mkdirSync(path.dirname(lockPath), { recursive: true });
      fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, acquired: new Date().toISOString() }));

      // Try to acquire with very short timeout
      const lock = new FileLock(lockPath, { timeoutMs: 50, staleMs: 60000 });
      expect(lock.acquire()).toBe(false);
    });

    it('handles lock file disappearing during acquire attempts', () => {
      const lockPath = path.join(testDir, '.agileflow', 'state', 'disappear.lock');
      const lock = new FileLock(lockPath, { timeoutMs: 200, staleMs: 60000 });

      // This should succeed as no lock exists
      expect(lock.acquire()).toBe(true);
      lock.release();
    });
  });

  describe('Task state transitions edge cases', () => {
    it('cannot transition from completed to running', () => {
      registry.create({ id: 'done-task', description: 'Already done' });
      registry.start('done-task');
      registry.complete('done-task');

      const result = registry.start('done-task');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition');
    });

    it('cannot transition from cancelled to running', () => {
      registry.create({ id: 'cancelled-task', description: 'Was cancelled' });
      registry.cancel('cancelled-task');

      const result = registry.start('cancelled-task');
      expect(result.success).toBe(false);
    });

    it('block transitions from queued to blocked', () => {
      registry.create({ id: 'will-block', description: 'To be blocked' });

      const result = registry.block('will-block', 'Manual block');
      expect(result.success).toBe(true);
      expect(registry.get('will-block').state).toBe('blocked');
    });
  });

  describe('DAG validation with complex graphs', () => {
    it('detects indirect cycles (A -> B -> C -> A)', () => {
      registry.create({ id: 'task-a', description: 'A' });
      registry.create({ id: 'task-b', description: 'B', blockedBy: ['task-a'] });
      registry.create({ id: 'task-c', description: 'C', blockedBy: ['task-b'] });

      // Try to add dependency from A to C (would create cycle)
      const result = registry.addDependency('task-a', 'task-c');
      expect(result.success).toBe(false);
      expect(result.error).toContain('circular');
    });

    it('allows diamond dependency patterns', () => {
      // Create diamond: A -> B, A -> C, B -> D, C -> D
      registry.create({ id: 'diamond-a', description: 'A' });
      registry.create({ id: 'diamond-b', description: 'B', blockedBy: ['diamond-a'] });
      registry.create({ id: 'diamond-c', description: 'C', blockedBy: ['diamond-a'] });
      registry.create({ id: 'diamond-d', description: 'D', blockedBy: ['diamond-b', 'diamond-c'] });

      // All should be valid
      const graph = registry.getDependencyGraph();
      expect(graph.nodes).toHaveLength(4);
      expect(graph.edges).toHaveLength(4);
    });

    it('validates graph after dependency removal', () => {
      registry.create({ id: 'parent', description: 'Parent' });
      registry.create({ id: 'child', description: 'Child', blockedBy: ['parent'] });

      registry.removeDependency('child', 'parent');
      expect(registry.get('child').blockedBy).toHaveLength(0);
    });
  });

  describe('Task with metadata', () => {
    it('preserves custom metadata fields', () => {
      registry.create({
        id: 'meta-task',
        description: 'Task with metadata',
        story_id: 'US-0042',
        subagent_type: 'agileflow-api',
        join_strategy: 'all',
        on_failure: 'fail-fast',
      });

      const task = registry.get('meta-task');
      expect(task.story_id).toBe('US-0042');
      expect(task.join_strategy).toBe('all');
      expect(task.on_failure).toBe('fail-fast');
    });

    it('updates metadata on task update', () => {
      registry.create({ id: 'update-meta', description: 'Original' });

      registry.update('update-meta', {
        description: 'Updated',
        metadata: { priority: 'high' },
      });

      const task = registry.get('update-meta');
      expect(task.description).toBe('Updated');
      expect(task.metadata.priority).toBe('high');
    });
  });

  describe('Concurrent operations', () => {
    it('handles rapid task creation', () => {
      const ids = [];
      for (let i = 0; i < 20; i++) {
        const result = registry.create({ description: `Task ${i}` });
        expect(result.success).toBe(true);
        ids.push(result.task.id);
      }

      expect(new Set(ids).size).toBe(20); // All unique IDs
    });

    it('handles interleaved state changes', () => {
      registry.create({ id: 'rapid-1', description: 'First' });
      registry.create({ id: 'rapid-2', description: 'Second' });
      registry.create({ id: 'rapid-3', description: 'Third', blockedBy: ['rapid-1', 'rapid-2'] });

      // Rapid state changes
      registry.start('rapid-1');
      registry.start('rapid-2');
      registry.complete('rapid-1');
      registry.fail('rapid-2', 'Error');
      registry.retry('rapid-2');
      registry.start('rapid-2');
      registry.complete('rapid-2');

      // rapid-3 should now be unblocked
      expect(registry.get('rapid-3').state).toBe('queued');
    });
  });

  describe('Cleanup operations', () => {
    it('cleanup does not remove recent completed tasks', () => {
      registry.create({ id: 'recent-done', description: 'Just finished' });
      registry.start('recent-done');
      registry.complete('recent-done');

      // Cleanup with 24 hour retention
      registry.cleanup(24 * 60 * 60 * 1000);

      // Should still exist
      expect(registry.get('recent-done')).toBeDefined();
    });

    it('cleanup preserves running tasks', () => {
      registry.create({ id: 'still-running', description: 'In progress' });
      registry.start('still-running');

      registry.cleanup(0); // Even with 0 retention

      expect(registry.get('still-running')).toBeDefined();
      expect(registry.get('still-running').state).toBe('running');
    });
  });

  describe('Event emissions', () => {
    it('emits created event with full task', () => {
      const handler = jest.fn();
      registry.on('created', handler);

      registry.create({ id: 'event-task', description: 'Test' });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].task.id).toBe('event-task');
    });

    it('emits updated event on transitions', () => {
      const handler = jest.fn();
      registry.on('updated', handler);

      registry.create({ id: 'state-task', description: 'Test' });
      registry.start('state-task');
      registry.complete('state-task');

      expect(handler).toHaveBeenCalledTimes(2);
      // Verify state transitions are in the changes
      expect(handler.mock.calls[0][0].changes).toContain('state');
      expect(handler.mock.calls[1][0].changes).toContain('state');
    });
  });

  describe('Query operations', () => {
    it('getAll with multiple filters', () => {
      registry.create({ id: 't1', description: 'API task', subagent_type: 'api', story_id: 'S1' });
      registry.create({ id: 't2', description: 'UI task', subagent_type: 'ui', story_id: 'S1' });
      registry.create({ id: 't3', description: 'API task 2', subagent_type: 'api', story_id: 'S2' });

      // Filter by subagent_type
      const apiTasks = registry.getAll({ subagent_type: 'api' });
      expect(apiTasks).toHaveLength(2);

      // Filter by story_id
      const s1Tasks = registry.getAll({ story_id: 'S1' });
      expect(s1Tasks).toHaveLength(2);
    });

    it('getTasksForStory returns empty array for unknown story', () => {
      const tasks = registry.getTasksForStory('NONEXISTENT');
      expect(tasks).toEqual([]);
    });

    it('getAuditTrail returns chronological order', () => {
      registry.create({ id: 'audit-test', description: 'Test' });
      registry.start('audit-test');
      registry.complete('audit-test');

      const trail = registry.getAuditTrail({ task_id: 'audit-test' });
      expect(trail.length).toBeGreaterThanOrEqual(2);

      // Check chronological order (audit trail uses 'at' field)
      for (let i = 1; i < trail.length; i++) {
        expect(new Date(trail[i].at).getTime())
          .toBeGreaterThanOrEqual(new Date(trail[i - 1].at).getTime());
      }
    });
  });
});
