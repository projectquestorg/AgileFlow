/**
 * Tests for status-task-bridge.js - Bridge between task-registry and status.json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  // Constants
  STATUS_PATH,
  TASKS_SCHEMA_VERSION,

  // Utilities
  loadStatus,
  saveStatus,

  // Migration
  migrateToTasksSchema,
  needsMigration,

  // Task-Story linking
  linkTaskToStory,
  unlinkTaskFromStory,
  getTasksForStory,
  getStoryTaskProgress,

  // Queries
  getStoriesWithTaskCounts,
  getActiveStoriesWithTasks,
  syncTaskCompletionToStory,

  // Snapshots
  createTaskSnapshot,
  saveTaskSnapshot,
} = require('../../../scripts/lib/status-task-bridge');

const { TaskRegistry, resetTaskRegistry } = require('../../../scripts/lib/task-registry');

// Test setup
let testDir;
let statusPath;
let registry;

/**
 * Create test status.json with sample data
 */
function createTestStatus() {
  const statusData = {
    updated: new Date().toISOString(),
    epics: {
      'EP-0001': {
        title: 'Test Epic',
        status: 'in_progress',
        stories: ['US-0001', 'US-0002'],
      },
    },
    stories: {
      'US-0001': {
        title: 'Test Story 1',
        status: 'in_progress',
        epic: 'EP-0001',
        priority: 'P1',
      },
      'US-0002': {
        title: 'Test Story 2',
        status: 'ready',
        epic: 'EP-0001',
        priority: 'P2',
      },
      'US-0003': {
        title: 'Completed Story',
        status: 'completed',
        epic: 'EP-0001',
        priority: 'P1',
      },
    },
  };

  fs.writeFileSync(statusPath, JSON.stringify(statusData, null, 2));
  return statusData;
}

beforeEach(() => {
  // Create isolated test directory
  testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'status-bridge-test-'));

  // Create directory structure
  fs.mkdirSync(path.join(testDir, '.agileflow', 'state'), { recursive: true });
  fs.mkdirSync(path.join(testDir, 'docs', '09-agents'), { recursive: true });

  statusPath = path.join(testDir, STATUS_PATH);

  // Create test status.json
  createTestStatus();

  // Reset and create task registry
  resetTaskRegistry();
  registry = new TaskRegistry({ rootDir: testDir });
});

afterEach(() => {
  // Cleanup
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch (e) {
    // Ignore
  }
});

// ============================================================================
// Utility Tests
// ============================================================================

describe('Utilities', () => {
  describe('loadStatus', () => {
    it('loads status.json from project', () => {
      const status = loadStatus(testDir);
      expect(status).toBeDefined();
      expect(status.stories).toBeDefined();
      expect(status.stories['US-0001']).toBeDefined();
    });

    it('returns null for missing file', () => {
      fs.unlinkSync(statusPath);
      const status = loadStatus(testDir);
      expect(status).toBeNull();
    });

    it('returns null for invalid JSON', () => {
      fs.writeFileSync(statusPath, 'invalid json');
      const status = loadStatus(testDir);
      expect(status).toBeNull();
    });
  });

  describe('saveStatus', () => {
    it('saves status.json to project', () => {
      const status = loadStatus(testDir);
      status.test_field = 'test_value';

      const result = saveStatus(status, testDir);
      expect(result).toBe(true);

      const reloaded = loadStatus(testDir);
      expect(reloaded.test_field).toBe('test_value');
    });

    it('adds updated_at timestamp', () => {
      const status = loadStatus(testDir);
      const before = new Date().toISOString();

      saveStatus(status, testDir);

      const reloaded = loadStatus(testDir);
      expect(reloaded.updated_at).toBeDefined();
      expect(new Date(reloaded.updated_at) >= new Date(before)).toBe(true);
    });
  });
});

// ============================================================================
// Migration Tests
// ============================================================================

describe('Migration', () => {
  describe('needsMigration', () => {
    it('returns true for status without tasks section', () => {
      const status = loadStatus(testDir);
      expect(needsMigration(status)).toBe(true);
    });

    it('returns false for status with tasks section', () => {
      const status = loadStatus(testDir);
      status.tasks = { _schema_version: '1.0.0' };
      expect(needsMigration(status)).toBe(false);
    });

    it('returns false for null', () => {
      expect(needsMigration(null)).toBe(false);
    });
  });

  describe('migrateToTasksSchema', () => {
    it('adds tasks section', () => {
      const status = loadStatus(testDir);
      expect(status.tasks).toBeUndefined();

      migrateToTasksSchema(status);

      expect(status.tasks).toBeDefined();
      expect(status.tasks._schema_version).toBe(TASKS_SCHEMA_VERSION);
    });

    it('adds task_ids to stories', () => {
      const status = loadStatus(testDir);
      expect(status.stories['US-0001'].task_ids).toBeUndefined();

      migrateToTasksSchema(status);

      expect(status.stories['US-0001'].task_ids).toEqual([]);
    });

    it('preserves existing data', () => {
      const status = loadStatus(testDir);
      migrateToTasksSchema(status);

      expect(status.stories['US-0001'].title).toBe('Test Story 1');
      expect(status.epics['EP-0001'].title).toBe('Test Epic');
    });

    it('is idempotent', () => {
      const status = loadStatus(testDir);
      migrateToTasksSchema(status);
      const firstMigration = JSON.stringify(status.tasks);

      migrateToTasksSchema(status);
      const secondMigration = JSON.stringify(status.tasks);

      expect(firstMigration).toBe(secondMigration);
    });
  });
});

// ============================================================================
// Task-Story Linking Tests
// ============================================================================

describe('Task-Story Linking', () => {
  describe('linkTaskToStory', () => {
    it('links task to story', () => {
      registry.create({ id: 'task-1', description: 'Test task' });

      const result = linkTaskToStory('US-0001', 'task-1', testDir);
      expect(result.success).toBe(true);

      const status = loadStatus(testDir);
      expect(status.stories['US-0001'].task_ids).toContain('task-1');
    });

    it('adds task reference to tasks section', () => {
      registry.create({ id: 'task-1', description: 'Test task' });

      linkTaskToStory('US-0001', 'task-1', testDir);

      const status = loadStatus(testDir);
      expect(status.tasks['task-1']).toBeDefined();
      expect(status.tasks['task-1'].story_id).toBe('US-0001');
    });

    it('returns error for unknown story', () => {
      const result = linkTaskToStory('US-9999', 'task-1', testDir);
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('does not duplicate task_id', () => {
      registry.create({ id: 'task-1', description: 'Test task' });

      linkTaskToStory('US-0001', 'task-1', testDir);
      linkTaskToStory('US-0001', 'task-1', testDir);

      const status = loadStatus(testDir);
      const count = status.stories['US-0001'].task_ids.filter(id => id === 'task-1').length;
      expect(count).toBe(1);
    });
  });

  describe('unlinkTaskFromStory', () => {
    it('unlinks task from story', () => {
      registry.create({ id: 'task-1', description: 'Test task' });
      linkTaskToStory('US-0001', 'task-1', testDir);

      const result = unlinkTaskFromStory('US-0001', 'task-1', testDir);
      expect(result.success).toBe(true);

      const status = loadStatus(testDir);
      expect(status.stories['US-0001'].task_ids).not.toContain('task-1');
    });

    it('removes task reference from tasks section', () => {
      registry.create({ id: 'task-1', description: 'Test task' });
      linkTaskToStory('US-0001', 'task-1', testDir);

      unlinkTaskFromStory('US-0001', 'task-1', testDir);

      const status = loadStatus(testDir);
      expect(status.tasks['task-1']).toBeUndefined();
    });
  });

  describe('getTasksForStory', () => {
    it('returns tasks linked to story', () => {
      registry.create({ id: 'task-1', description: 'Task 1', story_id: 'US-0001' });
      registry.create({ id: 'task-2', description: 'Task 2', story_id: 'US-0001' });
      linkTaskToStory('US-0001', 'task-1', testDir);
      linkTaskToStory('US-0001', 'task-2', testDir);

      const { tasks, story } = getTasksForStory('US-0001', testDir);

      expect(tasks).toHaveLength(2);
      expect(story).toBeDefined();
      expect(story.title).toBe('Test Story 1');
    });

    it('returns empty array for story without tasks', () => {
      const { tasks, story } = getTasksForStory('US-0002', testDir);

      expect(tasks).toHaveLength(0);
      expect(story).toBeDefined();
    });

    it('returns null story for unknown story', () => {
      const { tasks, story } = getTasksForStory('US-9999', testDir);

      expect(tasks).toHaveLength(0);
      expect(story).toBeNull();
    });
  });

  describe('getStoryTaskProgress', () => {
    beforeEach(() => {
      // Create and link tasks
      registry.create({ id: 'task-1', description: 'Task 1' });
      registry.create({ id: 'task-2', description: 'Task 2' });
      registry.create({ id: 'task-3', description: 'Task 3' });
      linkTaskToStory('US-0001', 'task-1', testDir);
      linkTaskToStory('US-0001', 'task-2', testDir);
      linkTaskToStory('US-0001', 'task-3', testDir);
    });

    it('calculates progress for all queued', () => {
      const progress = getStoryTaskProgress('US-0001', testDir);

      expect(progress.total).toBe(3);
      expect(progress.queued).toBe(3);
      expect(progress.completed).toBe(0);
      expect(progress.percentage).toBe(0);
    });

    it('calculates progress with some completed', () => {
      registry.start('task-1');
      registry.complete('task-1');
      registry.start('task-2');
      registry.complete('task-2');

      const progress = getStoryTaskProgress('US-0001', testDir);

      expect(progress.completed).toBe(2);
      expect(progress.queued).toBe(1);
      expect(progress.percentage).toBe(67); // 2/3 = 66.67%
    });

    it('tracks running and failed tasks', () => {
      registry.start('task-1');
      registry.start('task-2');
      registry.fail('task-2', 'Error');

      const progress = getStoryTaskProgress('US-0001', testDir);

      expect(progress.running).toBe(1);
      expect(progress.failed).toBe(1);
    });

    it('returns zero percentage for story without tasks', () => {
      const progress = getStoryTaskProgress('US-0002', testDir);
      expect(progress.total).toBe(0);
      expect(progress.percentage).toBe(0);
    });
  });
});

// ============================================================================
// Query Tests
// ============================================================================

describe('Queries', () => {
  beforeEach(() => {
    // Add tasks to some stories
    registry.create({ id: 'task-1', description: 'Task 1' });
    registry.create({ id: 'task-2', description: 'Task 2' });
    linkTaskToStory('US-0001', 'task-1', testDir);
    linkTaskToStory('US-0001', 'task-2', testDir);

    // Complete one task
    registry.start('task-1');
    registry.complete('task-1');
  });

  describe('getStoriesWithTaskCounts', () => {
    it('returns all stories with task counts', () => {
      const stories = getStoriesWithTaskCounts({}, testDir);

      expect(stories.length).toBeGreaterThanOrEqual(2);

      const story1 = stories.find(s => s.id === 'US-0001');
      expect(story1).toBeDefined();
      expect(story1.task_count).toBe(2);
      expect(story1.tasks_completed).toBe(1);
    });

    it('filters by status', () => {
      const stories = getStoriesWithTaskCounts({ status: 'in_progress' }, testDir);

      expect(stories.every(s => s.status === 'in_progress')).toBe(true);
    });

    it('filters by epic', () => {
      const stories = getStoriesWithTaskCounts({ epic: 'EP-0001' }, testDir);

      expect(stories.every(s => s.epic === 'EP-0001')).toBe(true);
    });
  });

  describe('getActiveStoriesWithTasks', () => {
    it('returns in-progress stories with tasks', () => {
      const stories = getActiveStoriesWithTasks(testDir);

      expect(stories.length).toBeGreaterThanOrEqual(1);
      expect(stories.every(s => s.task_count > 0)).toBe(true);
    });
  });

  describe('syncTaskCompletionToStory', () => {
    it('reports progress when not all complete', () => {
      const result = syncTaskCompletionToStory('US-0001', {}, testDir);

      expect(result.updated).toBe(false);
      expect(result.message).toContain('1/2');
    });

    it('reports all complete without auto-complete', () => {
      registry.start('task-2');
      registry.complete('task-2');

      const result = syncTaskCompletionToStory('US-0001', {}, testDir);

      expect(result.updated).toBe(false);
      expect(result.message).toContain('All 2 tasks complete');
    });

    it('auto-completes story when enabled', () => {
      registry.start('task-2');
      registry.complete('task-2');

      const result = syncTaskCompletionToStory('US-0001', { autoComplete: true }, testDir);

      expect(result.updated).toBe(true);

      const status = loadStatus(testDir);
      expect(status.stories['US-0001'].status).toBe('completed');
    });

    it('reports failed tasks', () => {
      registry.start('task-2');
      registry.fail('task-2', 'Error');

      const result = syncTaskCompletionToStory('US-0001', {}, testDir);

      expect(result.message).toContain('failed');
    });
  });
});

// ============================================================================
// Snapshot Tests
// ============================================================================

describe('Snapshots', () => {
  beforeEach(() => {
    registry.create({ id: 'task-1', description: 'Task 1', subagent_type: 'agileflow-api' });
    registry.create({
      id: 'task-2',
      description: 'Task 2',
      subagent_type: 'agileflow-ui',
      blockedBy: ['task-1'],
    });
    linkTaskToStory('US-0001', 'task-1', testDir);
    linkTaskToStory('US-0001', 'task-2', testDir);
  });

  describe('createTaskSnapshot', () => {
    it('creates snapshot of tasks for story', () => {
      const snapshot = createTaskSnapshot('US-0001', testDir);

      expect(snapshot).toBeDefined();
      expect(snapshot.story_id).toBe('US-0001');
      expect(snapshot.story_title).toBe('Test Story 1');
      expect(snapshot.task_count).toBe(2);
      expect(snapshot.tasks).toHaveLength(2);
    });

    it('includes task details in snapshot', () => {
      const snapshot = createTaskSnapshot('US-0001', testDir);

      const task1 = snapshot.tasks.find(t => t.id === 'task-1');
      expect(task1.description).toBe('Task 1');
      expect(task1.subagent_type).toBe('agileflow-api');
    });

    it('includes dependencies in snapshot', () => {
      const snapshot = createTaskSnapshot('US-0001', testDir);

      const task2 = snapshot.tasks.find(t => t.id === 'task-2');
      expect(task2.blockedBy).toContain('task-1');
    });

    it('returns null for unknown story', () => {
      const snapshot = createTaskSnapshot('US-9999', testDir);
      expect(snapshot).toBeNull();
    });
  });

  describe('saveTaskSnapshot', () => {
    it('saves snapshot to status.json', () => {
      const result = saveTaskSnapshot('US-0001', testDir);

      expect(result.success).toBe(true);
      expect(result.snapshot).toBeDefined();

      const status = loadStatus(testDir);
      expect(status.tasks._snapshots['US-0001']).toBeDefined();
    });

    it('overwrites existing snapshot with new timestamp', () => {
      const result1 = saveTaskSnapshot('US-0001', testDir);
      const firstTimestamp = result1.snapshot.snapshot_at;

      // Wait a tiny bit to ensure different timestamp
      const start = Date.now();
      while (Date.now() - start < 10) {
        // wait
      }

      const result2 = saveTaskSnapshot('US-0001', testDir);
      const secondTimestamp = result2.snapshot.snapshot_at;

      // Timestamps should be different
      expect(secondTimestamp).not.toBe(firstTimestamp);

      // Only latest snapshot should be stored
      const status = loadStatus(testDir);
      expect(status.tasks._snapshots['US-0001'].snapshot_at).toBe(secondTimestamp);
    });
  });
});
