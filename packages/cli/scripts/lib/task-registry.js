/**
 * task-registry.js - Multi-Agent Task Orchestration System
 *
 * Provides CRUD operations for tasks with:
 * - State machine with valid transitions (queued→running→completed/failed/blocked)
 * - DAG validation to prevent circular dependencies
 * - Atomic file writes (temp + rename) for crash recovery
 * - Lock file for concurrent access
 * - Event emissions for observability
 *
 * Task States:
 * - queued: Task is waiting to be executed
 * - running: Task is currently being executed by an agent
 * - completed: Task finished successfully
 * - failed: Task failed with an error
 * - blocked: Task cannot proceed due to unmet dependencies
 *
 * Valid Transitions:
 * - queued → running, blocked, cancelled
 * - running → completed, failed, blocked
 * - blocked → queued, running, cancelled
 * - completed → (terminal)
 * - failed → queued (retry), cancelled
 * - cancelled → (terminal)
 */

'use strict';

const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// ============================================================================
// Constants
// ============================================================================

// Valid task states - SINGLE SOURCE OF TRUTH
const TASK_STATES = ['queued', 'running', 'completed', 'failed', 'blocked', 'cancelled'];

// Terminal states (no transitions out)
const TERMINAL_STATES = ['completed', 'cancelled'];

// States indicating work is done (for metrics)
const DONE_STATES = ['completed', 'failed', 'cancelled'];

// Valid state transitions
// Key = from state, Value = array of valid "to" states
const TRANSITIONS = {
  queued: ['running', 'blocked', 'cancelled'],
  running: ['completed', 'failed', 'blocked'],
  blocked: ['queued', 'running', 'cancelled'],
  completed: [], // Terminal
  failed: ['queued', 'cancelled'], // Can retry
  cancelled: [], // Terminal
};

// Join strategies for parallel task groups
const JOIN_STRATEGIES = ['all', 'first', 'any', 'any-N', 'majority'];

// Failure policies
const FAILURE_POLICIES = ['fail-fast', 'continue', 'ignore'];

// Default configuration
const DEFAULT_STATE_PATH = '.agileflow/state/task-dependencies.json';
const LOCK_FILE_NAME = 'task-registry.lock';
const LOCK_TIMEOUT_MS = 30000; // 30 seconds
const LOCK_STALE_MS = 60000; // 1 minute - consider lock stale if older

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique task ID
 * @returns {string} Unique task ID (e.g., "task-abc12345")
 */
function generateTaskId() {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `task-${timestamp}-${random}`;
}

/**
 * Find project root by looking for .agileflow directory
 * @returns {string} Project root path or current working directory
 */
function findProjectRoot() {
  let dir = process.cwd();
  while (dir !== '/' && dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.agileflow'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

/**
 * Atomic file write using temp file + rename
 * @param {string} filePath - Target file path
 * @param {string} content - Content to write
 */
function atomicWrite(filePath, content) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Write to temp file first
  const tempPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tempPath, content, 'utf8');

  // Atomic rename
  fs.renameSync(tempPath, filePath);
}

/**
 * Safe JSON parse with default
 * @param {string} content - JSON string
 * @param {*} defaultValue - Default value if parse fails
 * @returns {*} Parsed value or default
 */
function safeJSONParse(content, defaultValue = null) {
  try {
    return JSON.parse(content);
  } catch (e) {
    return defaultValue;
  }
}

// ============================================================================
// DAG Validation
// ============================================================================

/**
 * Detect circular dependencies using DFS
 * @param {Object} tasks - Map of task ID to task object
 * @param {string} startId - Task ID to start from
 * @param {Set} [visited] - Already visited nodes
 * @param {Set} [recursionStack] - Current recursion path
 * @returns {{ hasCycle: boolean, cycle: string[] | null }}
 */
function detectCycle(tasks, startId, visited = new Set(), recursionStack = new Set()) {
  visited.add(startId);
  recursionStack.add(startId);

  const task = tasks[startId];
  if (!task) {
    return { hasCycle: false, cycle: null };
  }

  // Check all dependencies (blockedBy)
  const deps = task.blockedBy || [];
  for (const depId of deps) {
    if (!visited.has(depId)) {
      const result = detectCycle(tasks, depId, visited, recursionStack);
      if (result.hasCycle) {
        return result;
      }
    } else if (recursionStack.has(depId)) {
      // Found cycle - reconstruct it
      const cycleNodes = [depId, startId];
      return { hasCycle: true, cycle: cycleNodes };
    }
  }

  recursionStack.delete(startId);
  return { hasCycle: false, cycle: null };
}

/**
 * Validate entire task graph for cycles
 * @param {Object} tasks - Map of task ID to task object
 * @returns {{ valid: boolean, cycles: string[][] }}
 */
function validateDAG(tasks) {
  const visited = new Set();
  const cycles = [];

  for (const taskId of Object.keys(tasks)) {
    if (!visited.has(taskId)) {
      const result = detectCycle(tasks, taskId, visited, new Set());
      if (result.hasCycle && result.cycle) {
        cycles.push(result.cycle);
      }
    }
  }

  return {
    valid: cycles.length === 0,
    cycles,
  };
}

/**
 * Get topological sort of tasks (dependency order)
 * @param {Object} tasks - Map of task ID to task object
 * @returns {{ sorted: string[], valid: boolean }}
 */
function topologicalSort(tasks) {
  const inDegree = {};
  const adjList = {};

  // Initialize
  for (const taskId of Object.keys(tasks)) {
    inDegree[taskId] = 0;
    adjList[taskId] = [];
  }

  // Build adjacency list and in-degrees
  for (const [taskId, task] of Object.entries(tasks)) {
    const deps = task.blockedBy || [];
    for (const depId of deps) {
      if (adjList[depId]) {
        adjList[depId].push(taskId);
        inDegree[taskId]++;
      }
    }
  }

  // Kahn's algorithm
  const queue = [];
  for (const taskId of Object.keys(tasks)) {
    if (inDegree[taskId] === 0) {
      queue.push(taskId);
    }
  }

  const sorted = [];
  while (queue.length > 0) {
    const node = queue.shift();
    sorted.push(node);

    for (const neighbor of adjList[node] || []) {
      inDegree[neighbor]--;
      if (inDegree[neighbor] === 0) {
        queue.push(neighbor);
      }
    }
  }

  // If sorted doesn't include all tasks, there's a cycle
  const valid = sorted.length === Object.keys(tasks).length;

  return { sorted, valid };
}

// ============================================================================
// State Machine
// ============================================================================

/**
 * Check if a state is valid
 * @param {string} state - State to check
 * @returns {boolean}
 */
function isValidState(state) {
  return TASK_STATES.includes(state);
}

/**
 * Check if a transition is valid
 * @param {string} fromState - Current state
 * @param {string} toState - Target state
 * @returns {boolean}
 */
function isValidTransition(fromState, toState) {
  if (fromState === toState) return true; // No-op
  if (!TRANSITIONS[fromState]) return false;
  return TRANSITIONS[fromState].includes(toState);
}

/**
 * Get valid transitions from a state
 * @param {string} fromState - Current state
 * @returns {string[]}
 */
function getValidTransitions(fromState) {
  return TRANSITIONS[fromState] || [];
}

/**
 * Check if state is terminal
 * @param {string} state - State to check
 * @returns {boolean}
 */
function isTerminalState(state) {
  return TERMINAL_STATES.includes(state);
}

// ============================================================================
// Lock Management
// ============================================================================

/**
 * Simple file-based lock for concurrent access
 */
class FileLock {
  constructor(lockPath, options = {}) {
    this.lockPath = lockPath;
    this.timeout = options.timeout || LOCK_TIMEOUT_MS;
    this.staleMs = options.staleMs || LOCK_STALE_MS;
    this.held = false;
  }

  /**
   * Acquire lock with timeout
   * @returns {boolean} True if lock acquired
   */
  acquire() {
    const startTime = Date.now();

    while (Date.now() - startTime < this.timeout) {
      // Check if existing lock is stale
      if (fs.existsSync(this.lockPath)) {
        try {
          const stat = fs.statSync(this.lockPath);
          const age = Date.now() - stat.mtimeMs;
          if (age > this.staleMs) {
            // Stale lock - remove it
            fs.unlinkSync(this.lockPath);
          } else {
            // Lock held by another process - wait
            this._sleep(50);
            continue;
          }
        } catch (e) {
          // Lock file gone, continue to try acquiring
        }
      }

      // Try to acquire
      let fd = null;
      try {
        const dir = path.dirname(this.lockPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Use exclusive flag to prevent race
        fd = fs.openSync(this.lockPath, 'wx');
        const lockInfo = {
          pid: process.pid,
          hostname: os.hostname(),
          acquired: new Date().toISOString(),
        };
        fs.writeSync(fd, JSON.stringify(lockInfo));
        fs.closeSync(fd);
        fd = null;
        this.held = true;
        return true;
      } catch (e) {
        // Clean up fd if still open
        if (fd !== null) {
          try { fs.closeSync(fd); } catch (_) { /* ignore */ }
        }
        if (e.code === 'EEXIST') {
          // Another process got the lock
          this._sleep(50);
          continue;
        }
        throw e;
      }
    }

    return false;
  }

  /**
   * Release lock
   */
  release() {
    if (this.held && fs.existsSync(this.lockPath)) {
      try {
        fs.unlinkSync(this.lockPath);
      } catch (e) {
        // Ignore - lock may already be removed
      }
      this.held = false;
    }
  }

  /**
   * Synchronous sleep
   * @param {number} ms - Milliseconds to sleep
   */
  _sleep(ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      // Busy wait - not ideal but works for short durations
    }
  }
}

// ============================================================================
// Task Registry
// ============================================================================

/**
 * TaskRegistry - Event-driven task management with state machine
 */
class TaskRegistry extends EventEmitter {
  constructor(options = {}) {
    super();

    this.rootDir = options.rootDir || findProjectRoot();
    this.statePath = path.join(this.rootDir, options.statePath || DEFAULT_STATE_PATH);
    this.lockPath = path.join(path.dirname(this.statePath), LOCK_FILE_NAME);

    // Cache
    this._cache = null;
    this._dirty = false;
  }

  // --------------------------------------------------------------------------
  // State Persistence
  // --------------------------------------------------------------------------

  /**
   * Load task state from disk
   * @returns {Object} Task state
   */
  load() {
    if (this._cache && !this._dirty) {
      return this._cache;
    }

    const defaultState = this._createDefaultState();

    if (!fs.existsSync(this.statePath)) {
      this._cache = defaultState;
      this.save();
      return this._cache;
    }

    try {
      const content = fs.readFileSync(this.statePath, 'utf8');
      this._cache = safeJSONParse(content, defaultState);
      this._dirty = false;
      this.emit('loaded', { state: this._cache });
      return this._cache;
    } catch (e) {
      this.emit('error', { type: 'load', error: e.message });
      this._cache = defaultState;
      return this._cache;
    }
  }

  /**
   * Save task state to disk (atomic)
   */
  save() {
    if (!this._cache) return;

    this._cache.updated_at = new Date().toISOString();
    const content = JSON.stringify(this._cache, null, 2) + '\n';

    try {
      atomicWrite(this.statePath, content);
      this._dirty = false;
      this.emit('saved', { state: this._cache });
    } catch (e) {
      this.emit('error', { type: 'save', error: e.message });
      throw e;
    }
  }

  /**
   * Create default state structure
   * @returns {Object}
   */
  _createDefaultState() {
    return {
      schema_version: '1.0.0',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      tasks: {},
      task_groups: {},
      audit_trail: [],
    };
  }

  // --------------------------------------------------------------------------
  // CRUD Operations
  // --------------------------------------------------------------------------

  /**
   * Create a new task
   * @param {Object} taskData - Task data
   * @returns {{ success: boolean, task?: Object, error?: string }}
   */
  create(taskData) {
    const lock = new FileLock(this.lockPath);
    if (!lock.acquire()) {
      return { success: false, error: 'Could not acquire lock' };
    }

    try {
      const state = this.load();

      // Generate ID if not provided
      const taskId = taskData.id || generateTaskId();

      // Check for duplicate ID
      if (state.tasks[taskId]) {
        return { success: false, error: `Task ${taskId} already exists` };
      }

      // Validate dependencies won't create cycle
      if (taskData.blockedBy && taskData.blockedBy.length > 0) {
        // Temporarily add task to check for cycles
        const testTasks = {
          ...state.tasks,
          [taskId]: { ...taskData, blockedBy: taskData.blockedBy },
        };
        const dagResult = validateDAG(testTasks);
        if (!dagResult.valid) {
          return {
            success: false,
            error: `Adding this task would create circular dependency: ${dagResult.cycles[0].join(' → ')}`,
          };
        }
      }

      // Create task object
      const task = {
        id: taskId,
        description: taskData.description || '',
        prompt: taskData.prompt || '',
        subagent_type: taskData.subagent_type || null,
        state: 'queued',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        // Dependencies
        blockedBy: taskData.blockedBy || [],
        blocks: taskData.blocks || [],
        // Execution config
        join_strategy: taskData.join_strategy || 'all',
        on_failure: taskData.on_failure || 'fail-fast',
        run_in_background: taskData.run_in_background || false,
        // Link to story (optional)
        story_id: taskData.story_id || null,
        // Results (populated on completion)
        result: null,
        error: null,
        // Metadata
        metadata: taskData.metadata || {},
      };

      // Automatically set to blocked if has unmet dependencies
      if (task.blockedBy.length > 0) {
        const unmetDeps = task.blockedBy.filter(depId => {
          const dep = state.tasks[depId];
          return !dep || dep.state !== 'completed';
        });
        if (unmetDeps.length > 0) {
          task.state = 'blocked';
        }
      }

      // Update reverse dependencies (blocks)
      for (const blockerId of task.blockedBy) {
        if (state.tasks[blockerId]) {
          if (!state.tasks[blockerId].blocks) {
            state.tasks[blockerId].blocks = [];
          }
          if (!state.tasks[blockerId].blocks.includes(taskId)) {
            state.tasks[blockerId].blocks.push(taskId);
          }
        }
      }

      // Store task
      state.tasks[taskId] = task;
      this._dirty = true;
      this.save();

      // Emit event
      this.emit('created', { task });

      return { success: true, task };
    } finally {
      lock.release();
    }
  }

  /**
   * Get a task by ID
   * @param {string} taskId - Task ID
   * @returns {Object|null}
   */
  get(taskId) {
    const state = this.load();
    return state.tasks[taskId] || null;
  }

  /**
   * Get all tasks
   * @param {Object} [filter] - Optional filter
   * @returns {Object[]}
   */
  getAll(filter = {}) {
    const state = this.load();
    let tasks = Object.values(state.tasks);

    // Apply filters
    if (filter.state) {
      tasks = tasks.filter(t => t.state === filter.state);
    }
    if (filter.story_id) {
      tasks = tasks.filter(t => t.story_id === filter.story_id);
    }
    if (filter.subagent_type) {
      tasks = tasks.filter(t => t.subagent_type === filter.subagent_type);
    }

    return tasks;
  }

  /**
   * Update a task
   * @param {string} taskId - Task ID
   * @param {Object} updates - Fields to update
   * @returns {{ success: boolean, task?: Object, error?: string }}
   */
  update(taskId, updates) {
    const lock = new FileLock(this.lockPath);
    if (!lock.acquire()) {
      return { success: false, error: 'Could not acquire lock' };
    }

    try {
      const state = this.load();
      const task = state.tasks[taskId];

      if (!task) {
        return { success: false, error: `Task ${taskId} not found` };
      }

      // Handle state transition
      if (updates.state && updates.state !== task.state) {
        if (!isValidTransition(task.state, updates.state)) {
          return {
            success: false,
            error: `Invalid transition: ${task.state} → ${updates.state}. Valid: ${getValidTransitions(task.state).join(', ') || 'none'}`,
          };
        }

        // Log to audit trail
        state.audit_trail.push({
          task_id: taskId,
          from_state: task.state,
          to_state: updates.state,
          at: new Date().toISOString(),
          reason: updates.reason || null,
        });
      }

      // Handle dependency updates
      if (updates.blockedBy) {
        // Validate no cycles
        const testTask = { ...task, blockedBy: updates.blockedBy };
        const testTasks = { ...state.tasks, [taskId]: testTask };
        const dagResult = validateDAG(testTasks);
        if (!dagResult.valid) {
          return {
            success: false,
            error: `Update would create circular dependency: ${dagResult.cycles[0].join(' → ')}`,
          };
        }
      }

      // Apply updates
      const changedFields = [];
      for (const [key, value] of Object.entries(updates)) {
        if (key === 'reason') continue; // reason is for audit only
        if (JSON.stringify(task[key]) !== JSON.stringify(value)) {
          task[key] = value;
          changedFields.push(key);
        }
      }

      if (changedFields.length > 0) {
        task.updated_at = new Date().toISOString();

        // If transitioning to completed, unblock dependent tasks AFTER state is applied
        if (changedFields.includes('state') && task.state === 'completed') {
          this._unblockDependents(state, taskId);
        }

        this._dirty = true;
        this.save();

        this.emit('updated', { task, changes: changedFields });
      }

      return { success: true, task };
    } finally {
      lock.release();
    }
  }

  /**
   * Delete a task
   * @param {string} taskId - Task ID
   * @returns {{ success: boolean, error?: string }}
   */
  delete(taskId) {
    const lock = new FileLock(this.lockPath);
    if (!lock.acquire()) {
      return { success: false, error: 'Could not acquire lock' };
    }

    try {
      const state = this.load();
      const task = state.tasks[taskId];

      if (!task) {
        return { success: false, error: `Task ${taskId} not found` };
      }

      // Remove from blockedBy lists of other tasks
      for (const otherTask of Object.values(state.tasks)) {
        if (otherTask.blockedBy) {
          otherTask.blockedBy = otherTask.blockedBy.filter(id => id !== taskId);
        }
        if (otherTask.blocks) {
          otherTask.blocks = otherTask.blocks.filter(id => id !== taskId);
        }
      }

      delete state.tasks[taskId];
      this._dirty = true;
      this.save();

      this.emit('deleted', { taskId });

      return { success: true };
    } finally {
      lock.release();
    }
  }

  // --------------------------------------------------------------------------
  // State Transitions
  // --------------------------------------------------------------------------

  /**
   * Transition a task to a new state
   * @param {string} taskId - Task ID
   * @param {string} toState - Target state
   * @param {Object} [options] - Options
   * @returns {{ success: boolean, task?: Object, error?: string }}
   */
  transition(taskId, toState, options = {}) {
    const { reason = null, result = null, error = null } = options;

    const updates = { state: toState, reason };
    if (result !== null) updates.result = result;
    if (error !== null) updates.error = error;

    return this.update(taskId, updates);
  }

  /**
   * Mark task as running
   * @param {string} taskId - Task ID
   * @returns {{ success: boolean, task?: Object, error?: string }}
   */
  start(taskId) {
    return this.transition(taskId, 'running');
  }

  /**
   * Mark task as completed
   * @param {string} taskId - Task ID
   * @param {*} result - Task result
   * @returns {{ success: boolean, task?: Object, error?: string }}
   */
  complete(taskId, result = null) {
    return this.transition(taskId, 'completed', { result });
  }

  /**
   * Mark task as failed
   * @param {string} taskId - Task ID
   * @param {string} error - Error message
   * @returns {{ success: boolean, task?: Object, error?: string }}
   */
  fail(taskId, error) {
    return this.transition(taskId, 'failed', { error });
  }

  /**
   * Mark task as blocked
   * @param {string} taskId - Task ID
   * @param {string} reason - Reason for blocking
   * @returns {{ success: boolean, task?: Object, error?: string }}
   */
  block(taskId, reason) {
    return this.transition(taskId, 'blocked', { reason });
  }

  /**
   * Cancel a task
   * @param {string} taskId - Task ID
   * @param {string} reason - Reason for cancellation
   * @returns {{ success: boolean, task?: Object, error?: string }}
   */
  cancel(taskId, reason) {
    return this.transition(taskId, 'cancelled', { reason });
  }

  /**
   * Retry a failed task
   * @param {string} taskId - Task ID
   * @returns {{ success: boolean, task?: Object, error?: string }}
   */
  retry(taskId) {
    const task = this.get(taskId);
    if (!task) {
      return { success: false, error: `Task ${taskId} not found` };
    }
    if (task.state !== 'failed') {
      return { success: false, error: `Can only retry failed tasks, current state: ${task.state}` };
    }
    return this.transition(taskId, 'queued', { reason: 'retry' });
  }

  // --------------------------------------------------------------------------
  // Dependency Management
  // --------------------------------------------------------------------------

  /**
   * Add a dependency (blockedBy)
   * @param {string} taskId - Task that will be blocked
   * @param {string} blockerId - Task that blocks
   * @returns {{ success: boolean, error?: string }}
   */
  addDependency(taskId, blockerId) {
    const task = this.get(taskId);
    if (!task) {
      return { success: false, error: `Task ${taskId} not found` };
    }

    const blockedBy = [...(task.blockedBy || [])];
    if (!blockedBy.includes(blockerId)) {
      blockedBy.push(blockerId);
    }

    return this.update(taskId, { blockedBy });
  }

  /**
   * Remove a dependency
   * @param {string} taskId - Task ID
   * @param {string} blockerId - Blocker to remove
   * @returns {{ success: boolean, error?: string }}
   */
  removeDependency(taskId, blockerId) {
    const task = this.get(taskId);
    if (!task) {
      return { success: false, error: `Task ${taskId} not found` };
    }

    const blockedBy = (task.blockedBy || []).filter(id => id !== blockerId);
    return this.update(taskId, { blockedBy });
  }

  /**
   * Get tasks that are ready to run (queued with no unmet dependencies)
   * @returns {Object[]}
   */
  getReadyTasks() {
    const state = this.load();
    const ready = [];

    for (const task of Object.values(state.tasks)) {
      if (task.state !== 'queued') continue;

      // Check all dependencies are complete
      const unmetDeps = (task.blockedBy || []).filter(depId => {
        const dep = state.tasks[depId];
        return !dep || dep.state !== 'completed';
      });

      if (unmetDeps.length === 0) {
        ready.push(task);
      }
    }

    return ready;
  }

  /**
   * Get the dependency graph for visualization
   * @returns {{ nodes: Object[], edges: Object[] }}
   */
  getDependencyGraph() {
    const state = this.load();
    const nodes = [];
    const edges = [];

    for (const task of Object.values(state.tasks)) {
      nodes.push({
        id: task.id,
        label: task.description || task.id,
        state: task.state,
        subagent_type: task.subagent_type,
      });

      for (const blockerId of task.blockedBy || []) {
        edges.push({
          from: blockerId,
          to: task.id,
        });
      }
    }

    return { nodes, edges };
  }

  /**
   * Unblock dependent tasks when a task completes
   * @param {Object} state - Current state
   * @param {string} completedTaskId - ID of completed task
   */
  _unblockDependents(state, completedTaskId) {
    const completedTask = state.tasks[completedTaskId];
    if (!completedTask) return;

    // Find tasks that were blocked by this one
    for (const dependentId of completedTask.blocks || []) {
      const dependent = state.tasks[dependentId];
      if (!dependent || dependent.state !== 'blocked') continue;

      // Check if all blockers are now complete
      const unmetDeps = (dependent.blockedBy || []).filter(depId => {
        const dep = state.tasks[depId];
        return !dep || dep.state !== 'completed';
      });

      if (unmetDeps.length === 0) {
        dependent.state = 'queued';
        dependent.updated_at = new Date().toISOString();
        state.audit_trail.push({
          task_id: dependentId,
          from_state: 'blocked',
          to_state: 'queued',
          at: new Date().toISOString(),
          reason: `Unblocked: ${completedTaskId} completed`,
        });
        this.emit('unblocked', { task: dependent, unblockedBy: completedTaskId });
      }
    }
  }

  // --------------------------------------------------------------------------
  // Task Groups
  // --------------------------------------------------------------------------

  /**
   * Create a task group for parallel execution
   * @param {Object} groupData - Group configuration
   * @returns {{ success: boolean, group?: Object, error?: string }}
   */
  createGroup(groupData) {
    const lock = new FileLock(this.lockPath);
    if (!lock.acquire()) {
      return { success: false, error: 'Could not acquire lock' };
    }

    try {
      const state = this.load();

      const groupId = groupData.id || `group-${Date.now().toString(36)}`;

      if (state.task_groups[groupId]) {
        return { success: false, error: `Group ${groupId} already exists` };
      }

      const group = {
        id: groupId,
        name: groupData.name || groupId,
        task_ids: groupData.task_ids || [],
        join_strategy: groupData.join_strategy || 'all',
        on_failure: groupData.on_failure || 'fail-fast',
        created_at: new Date().toISOString(),
        state: 'pending', // pending, running, completed, failed
      };

      state.task_groups[groupId] = group;
      this._dirty = true;
      this.save();

      this.emit('group_created', { group });

      return { success: true, group };
    } finally {
      lock.release();
    }
  }

  /**
   * Get group status
   * @param {string} groupId - Group ID
   * @returns {Object|null}
   */
  getGroupStatus(groupId) {
    const state = this.load();
    const group = state.task_groups[groupId];
    if (!group) return null;

    const tasks = group.task_ids.map(id => state.tasks[id]).filter(Boolean);
    const completed = tasks.filter(t => t.state === 'completed').length;
    const failed = tasks.filter(t => t.state === 'failed').length;
    const running = tasks.filter(t => t.state === 'running').length;

    return {
      ...group,
      total: tasks.length,
      completed,
      failed,
      running,
      pending: tasks.length - completed - failed - running,
    };
  }

  // --------------------------------------------------------------------------
  // Metrics & Queries
  // --------------------------------------------------------------------------

  /**
   * Get task statistics
   * @returns {Object}
   */
  getStats() {
    const state = this.load();
    const tasks = Object.values(state.tasks);

    const byState = {};
    for (const s of TASK_STATES) {
      byState[s] = tasks.filter(t => t.state === s).length;
    }

    const byAgent = {};
    for (const task of tasks) {
      const agent = task.subagent_type || 'unknown';
      byAgent[agent] = (byAgent[agent] || 0) + 1;
    }

    return {
      total: tasks.length,
      by_state: byState,
      by_agent: byAgent,
      groups: Object.keys(state.task_groups).length,
    };
  }

  /**
   * Get tasks for a story
   * @param {string} storyId - Story ID
   * @returns {Object[]}
   */
  getTasksForStory(storyId) {
    return this.getAll({ story_id: storyId });
  }

  /**
   * Get audit trail
   * @param {Object} [filter] - Optional filter
   * @returns {Object[]}
   */
  getAuditTrail(filter = {}) {
    const state = this.load();
    let trail = [...state.audit_trail];

    if (filter.task_id) {
      trail = trail.filter(e => e.task_id === filter.task_id);
    }

    return trail;
  }

  /**
   * Clear completed/cancelled tasks older than threshold
   * @param {number} [maxAgeMs] - Max age in milliseconds (default: 7 days)
   * @returns {{ cleared: number }}
   */
  cleanup(maxAgeMs = 7 * 24 * 60 * 60 * 1000) {
    const lock = new FileLock(this.lockPath);
    if (!lock.acquire()) {
      return { cleared: 0 };
    }

    try {
      const state = this.load();
      const now = Date.now();
      let cleared = 0;

      for (const [taskId, task] of Object.entries(state.tasks)) {
        if (!DONE_STATES.includes(task.state)) continue;

        const updatedAt = new Date(task.updated_at).getTime();
        if (now - updatedAt > maxAgeMs) {
          delete state.tasks[taskId];
          cleared++;
        }
      }

      if (cleared > 0) {
        this._dirty = true;
        this.save();
        this.emit('cleanup', { cleared });
      }

      return { cleared };
    } finally {
      lock.release();
    }
  }
}

// ============================================================================
// Singleton & Factory
// ============================================================================

let _instance = null;

/**
 * Get singleton registry instance
 * @param {Object} [options] - Options
 * @returns {TaskRegistry}
 */
function getTaskRegistry(options = {}) {
  if (!_instance || options.forceNew) {
    _instance = new TaskRegistry(options);
  }
  return _instance;
}

/**
 * Reset singleton (for testing)
 */
function resetTaskRegistry() {
  _instance = null;
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
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
  findProjectRoot,
  atomicWrite,

  // Classes
  TaskRegistry,
  FileLock,

  // Factory
  getTaskRegistry,
  resetTaskRegistry,
};
