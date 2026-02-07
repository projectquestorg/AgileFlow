/**
 * Tests for scripts/lib/task-sync.js
 *
 * Bidirectional sync between status.json stories and native task list.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

jest.mock('../../lib/paths', () => ({
  getProjectRoot: jest.fn(() => '/test/project'),
  getStatusPath: jest.fn(root => `${root || '/test/project'}/docs/09-agents/status.json`),
  getSessionStatePath: jest.fn(
    root => `${root || '/test/project'}/docs/09-agents/session-state.json`
  ),
  getMetadataPath: jest.fn(
    root => `${root || '/test/project'}/docs/00-meta/agileflow-metadata.json`
  ),
}));

const { paths } = jest.requireMock('../../lib/paths');

describe('task-sync.js', () => {
  let testDir;
  let taskSync;

  beforeEach(() => {
    // Create temp directory
    testDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agileflow-task-sync-test-'));

    // Create directory structure
    fs.mkdirSync(path.join(testDir, 'docs', '09-agents'), { recursive: true });

    // Reset require cache
    delete require.cache[require.resolve('../../scripts/lib/task-sync')];
    taskSync = require('../../scripts/lib/task-sync');
  });

  afterEach(() => {
    // Clean up test directory
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('storyStatusToTaskStatus()', () => {
    test('maps ready to pending', () => {
      const result = taskSync.storyStatusToTaskStatus('ready');
      expect(result).toBe('pending');
    });

    test('maps in_progress to in_progress', () => {
      const result = taskSync.storyStatusToTaskStatus('in_progress');
      expect(result).toBe('in_progress');
    });

    test('maps in_review to in_progress', () => {
      const result = taskSync.storyStatusToTaskStatus('in_review');
      expect(result).toBe('in_progress');
    });

    test('maps blocked to pending', () => {
      const result = taskSync.storyStatusToTaskStatus('blocked');
      expect(result).toBe('pending');
    });

    test('maps completed to completed', () => {
      const result = taskSync.storyStatusToTaskStatus('completed');
      expect(result).toBe('completed');
    });

    test('defaults to pending for unknown status', () => {
      const result = taskSync.storyStatusToTaskStatus('unknown');
      expect(result).toBe('pending');
    });
  });

  describe('taskStatusToStoryStatus()', () => {
    test('maps pending to ready', () => {
      const result = taskSync.taskStatusToStoryStatus('pending');
      expect(result).toBe('ready');
    });

    test('maps in_progress to in_progress', () => {
      const result = taskSync.taskStatusToStoryStatus('in_progress');
      expect(result).toBe('in_progress');
    });

    test('maps completed to completed', () => {
      const result = taskSync.taskStatusToStoryStatus('completed');
      expect(result).toBe('completed');
    });

    test('defaults to ready for unknown status', () => {
      const result = taskSync.taskStatusToStoryStatus('unknown');
      expect(result).toBe('ready');
    });
  });

  describe('syncToStatus()', () => {
    test('updates story status in status.json', () => {
      const statusPath = path.join(testDir, 'docs', '09-agents', 'status.json');
      const status = {
        stories: {
          'US-0001': {
            id: 'US-0001',
            title: 'Test Story',
            status: 'ready',
          },
        },
      };
      fs.writeFileSync(statusPath, JSON.stringify(status));

      const result = taskSync.syncToStatus(testDir, 'US-0001', { status: 'in_progress' });

      expect(result.ok).toBe(true);

      const updated = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      expect(updated.stories['US-0001'].status).toBe('in_progress');
    });

    test('updates timestamp when syncing', () => {
      const statusPath = path.join(testDir, 'docs', '09-agents', 'status.json');
      const status = {
        stories: {
          'US-0001': {
            id: 'US-0001',
            title: 'Test Story',
            status: 'ready',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        },
      };
      fs.writeFileSync(statusPath, JSON.stringify(status));

      const before = new Date();
      taskSync.syncToStatus(testDir, 'US-0001', { status: 'in_progress' });
      const after = new Date();

      const updated = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      const updatedTime = new Date(updated.stories['US-0001'].updated_at);

      expect(updatedTime.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(updatedTime.getTime()).toBeLessThanOrEqual(after.getTime());
    });

    test('applies multiple field updates', () => {
      const statusPath = path.join(testDir, 'docs', '09-agents', 'status.json');
      const status = {
        stories: {
          'US-0001': {
            id: 'US-0001',
            title: 'Test Story',
            status: 'ready',
            assigned_to: 'AG-API',
          },
        },
      };
      fs.writeFileSync(statusPath, JSON.stringify(status));

      taskSync.syncToStatus(testDir, 'US-0001', {
        status: 'in_progress',
        assigned_to: 'AG-UI',
      });

      const updated = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      expect(updated.stories['US-0001'].status).toBe('in_progress');
      expect(updated.stories['US-0001'].assigned_to).toBe('AG-UI');
    });

    test('returns error when status.json not found', () => {
      const result = taskSync.syncToStatus(testDir, 'US-0001', { status: 'in_progress' });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('returns error when story not found', () => {
      const statusPath = path.join(testDir, 'docs', '09-agents', 'status.json');
      const status = {
        stories: {
          'US-0001': {
            id: 'US-0001',
            title: 'Test Story',
            status: 'ready',
          },
        },
      };
      fs.writeFileSync(statusPath, JSON.stringify(status));

      const result = taskSync.syncToStatus(testDir, 'US-0002', { status: 'in_progress' });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('syncFromStatus()', () => {
    test('returns tasks from stories in status.json', () => {
      const statusPath = path.join(testDir, 'docs', '09-agents', 'status.json');
      const status = {
        stories: {
          'US-0001': {
            id: 'US-0001',
            title: 'First Task',
            status: 'ready',
            epic: 'EP-001',
            owner: 'AG-API',
          },
          'US-0002': {
            id: 'US-0002',
            title: 'Second Task',
            status: 'in_progress',
            epic: 'EP-001',
            owner: 'AG-UI',
          },
        },
      };
      fs.writeFileSync(statusPath, JSON.stringify(status));

      const result = taskSync.syncFromStatus(testDir);

      expect(result.ok).toBe(true);
      expect(result.tasks).toHaveLength(2);
      expect(result.tasks[0].id).toBe('US-0001');
      expect(result.tasks[0].subject).toContain('US-0001');
      expect(result.tasks[0].subject).toContain('First Task');
    });

    test('filters by epic', () => {
      const statusPath = path.join(testDir, 'docs', '09-agents', 'status.json');
      const status = {
        stories: {
          'US-0001': {
            id: 'US-0001',
            title: 'First Task',
            status: 'ready',
            epic: 'EP-001',
          },
          'US-0002': {
            id: 'US-0002',
            title: 'Second Task',
            status: 'ready',
            epic: 'EP-002',
          },
        },
      };
      fs.writeFileSync(statusPath, JSON.stringify(status));

      const result = taskSync.syncFromStatus(testDir, { epic: 'EP-001' });

      expect(result.ok).toBe(true);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].id).toBe('US-0001');
    });

    test('filters by status', () => {
      const statusPath = path.join(testDir, 'docs', '09-agents', 'status.json');
      const status = {
        stories: {
          'US-0001': {
            id: 'US-0001',
            title: 'First Task',
            status: 'ready',
          },
          'US-0002': {
            id: 'US-0002',
            title: 'Second Task',
            status: 'in_progress',
          },
        },
      };
      fs.writeFileSync(statusPath, JSON.stringify(status));

      const result = taskSync.syncFromStatus(testDir, { status: 'in_progress' });

      expect(result.ok).toBe(true);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].id).toBe('US-0002');
    });

    test('filters by owner', () => {
      const statusPath = path.join(testDir, 'docs', '09-agents', 'status.json');
      const status = {
        stories: {
          'US-0001': {
            id: 'US-0001',
            title: 'First Task',
            status: 'ready',
            owner: 'AG-API',
          },
          'US-0002': {
            id: 'US-0002',
            title: 'Second Task',
            status: 'ready',
            owner: 'AG-UI',
          },
        },
      };
      fs.writeFileSync(statusPath, JSON.stringify(status));

      const result = taskSync.syncFromStatus(testDir, { owner: 'AG-API' });

      expect(result.ok).toBe(true);
      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0].owner).toBe('AG-API');
    });

    test('returns empty task list when status.json not found', () => {
      const result = taskSync.syncFromStatus(testDir);
      expect(result.ok).toBe(true);
      expect(result.tasks).toHaveLength(0);
    });

    test('returns status map in task metadata', () => {
      const statusPath = path.join(testDir, 'docs', '09-agents', 'status.json');
      const status = {
        stories: {
          'US-0001': {
            id: 'US-0001',
            title: 'Test Task',
            status: 'in_progress',
            epic: 'EP-001',
          },
        },
      };
      fs.writeFileSync(statusPath, JSON.stringify(status));

      const result = taskSync.syncFromStatus(testDir);

      expect(result.tasks[0].status).toBe('in_progress');
      expect(result.tasks[0].metadata.story_id).toBe('US-0001');
      expect(result.tasks[0].metadata.epic).toBe('EP-001');
      expect(result.tasks[0].metadata.original_status).toBe('in_progress');
    });
  });

  describe('reconcile()', () => {
    test('updates story status from native task state', () => {
      const statusPath = path.join(testDir, 'docs', '09-agents', 'status.json');
      const status = {
        stories: {
          'US-0001': {
            id: 'US-0001',
            title: 'Test Task',
            status: 'ready',
          },
        },
      };
      fs.writeFileSync(statusPath, JSON.stringify(status));

      const nativeTasks = [
        {
          id: 'task-123',
          status: 'completed',
          metadata: {
            story_id: 'US-0001',
          },
        },
      ];

      const result = taskSync.reconcile(testDir, nativeTasks);

      expect(result.ok).toBe(true);
      expect(result.updated).toBe(1);

      const updated = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      expect(updated.stories['US-0001'].status).toBe('completed');
    });

    test('sets completed_at when status changes to completed', () => {
      const statusPath = path.join(testDir, 'docs', '09-agents', 'status.json');
      const status = {
        stories: {
          'US-0001': {
            id: 'US-0001',
            title: 'Test Task',
            status: 'in_progress',
          },
        },
      };
      fs.writeFileSync(statusPath, JSON.stringify(status));

      const nativeTasks = [
        {
          id: 'task-123',
          status: 'completed',
          metadata: {
            story_id: 'US-0001',
          },
        },
      ];

      taskSync.reconcile(testDir, nativeTasks);

      const updated = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      expect(updated.stories['US-0001'].completed_at).toBeDefined();
      expect(typeof updated.stories['US-0001'].completed_at).toBe('string');
    });

    test('only updates changed stories', () => {
      const statusPath = path.join(testDir, 'docs', '09-agents', 'status.json');
      const status = {
        stories: {
          'US-0001': {
            id: 'US-0001',
            title: 'Test Task',
            status: 'in_progress',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        },
      };
      fs.writeFileSync(statusPath, JSON.stringify(status));

      const nativeTasks = [
        {
          id: 'task-123',
          status: 'in_progress', // No change
          metadata: {
            story_id: 'US-0001',
          },
        },
      ];

      const result = taskSync.reconcile(testDir, nativeTasks);

      expect(result.updated).toBe(0);
    });

    test('handles multiple tasks', () => {
      const statusPath = path.join(testDir, 'docs', '09-agents', 'status.json');
      const status = {
        stories: {
          'US-0001': {
            id: 'US-0001',
            title: 'Task 1',
            status: 'ready',
          },
          'US-0002': {
            id: 'US-0002',
            title: 'Task 2',
            status: 'ready',
          },
          'US-0003': {
            id: 'US-0003',
            title: 'Task 3',
            status: 'in_progress',
          },
        },
      };
      fs.writeFileSync(statusPath, JSON.stringify(status));

      const nativeTasks = [
        {
          id: 'task-1',
          status: 'completed',
          metadata: { story_id: 'US-0001' },
        },
        {
          id: 'task-2',
          status: 'in_progress',
          metadata: { story_id: 'US-0002' },
        },
        {
          id: 'task-3',
          status: 'completed',
          metadata: { story_id: 'US-0003' },
        },
      ];

      const result = taskSync.reconcile(testDir, nativeTasks);

      expect(result.updated).toBe(3); // All three stories changed
    });

    test('skips tasks with missing story', () => {
      const statusPath = path.join(testDir, 'docs', '09-agents', 'status.json');
      const status = {
        stories: {
          'US-0001': {
            id: 'US-0001',
            title: 'Task 1',
            status: 'ready',
          },
        },
      };
      fs.writeFileSync(statusPath, JSON.stringify(status));

      const nativeTasks = [
        {
          id: 'task-1',
          status: 'completed',
          metadata: { story_id: 'US-0002' }, // Doesn't exist
        },
      ];

      const result = taskSync.reconcile(testDir, nativeTasks);

      expect(result.ok).toBe(true);
      expect(result.updated).toBe(0);
    });

    test('returns error when status.json not found', () => {
      const result = taskSync.reconcile(testDir, []);
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('updates timestamp on reconciliation', () => {
      const statusPath = path.join(testDir, 'docs', '09-agents', 'status.json');
      const status = {
        stories: {
          'US-0001': {
            id: 'US-0001',
            title: 'Test Task',
            status: 'ready',
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        },
      };
      fs.writeFileSync(statusPath, JSON.stringify(status));

      const nativeTasks = [
        {
          id: 'task-123',
          status: 'in_progress',
          metadata: { story_id: 'US-0001' },
        },
      ];

      taskSync.reconcile(testDir, nativeTasks);

      const updated = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      expect(new Date(updated.stories['US-0001'].updated_at).getTime()).toBeGreaterThan(
        new Date('2026-01-01T00:00:00.000Z').getTime()
      );
    });
  });

  describe('readStatusStories() and writeStatusStories()', () => {
    test('reads stories from status.json', () => {
      const statusPath = path.join(testDir, 'docs', '09-agents', 'status.json');
      const status = {
        stories: {
          'US-0001': { id: 'US-0001', title: 'Test', status: 'ready' },
        },
      };
      fs.writeFileSync(statusPath, JSON.stringify(status));

      const result = taskSync.readStatusStories(testDir);
      expect(result['US-0001'].title).toBe('Test');
    });

    test('writes stories back to status.json', () => {
      const statusPath = path.join(testDir, 'docs', '09-agents', 'status.json');
      fs.writeFileSync(statusPath, JSON.stringify({}));

      const stories = {
        'US-0001': { id: 'US-0001', title: 'Test', status: 'ready' },
      };

      taskSync.writeStatusStories(testDir, stories);

      const updated = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      expect(updated.stories['US-0001'].title).toBe('Test');
    });
  });
});
