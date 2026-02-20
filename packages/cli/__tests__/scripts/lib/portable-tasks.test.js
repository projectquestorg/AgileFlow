/**
 * Tests for portable-tasks.js - File-based task tracking
 *
 * Tests cover all core functions:
 * - parseTasksFile() - markdown parsing
 * - formatTasksFile() - markdown generation
 * - loadTasks() - read from disk
 * - saveTasks() - write to disk
 * - addTask() - create new tasks
 * - updateTask() - modify existing tasks
 * - deleteTask() - remove tasks
 * - getTask() - retrieve single task
 * - listTasks() - filter and list tasks
 * - getNextId() - auto-increment task IDs
 *
 * Round-trip tests ensure parse -> modify -> format -> parse cycle is stable
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  parseTasksFile,
  formatTasksFile,
  loadTasks,
  saveTasks,
  addTask,
  updateTask,
  deleteTask,
  getTask,
  listTasks,
  getNextId,
} = require('../../../scripts/lib/portable-tasks');

describe('portable-tasks.js', () => {
  let tempDir;

  beforeAll(() => {
    // Create a temporary directory for tests
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'portable-tasks-test-'));
  });

  afterAll(() => {
    // Clean up temporary directory
    if (fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('parseTasksFile', () => {
    it('parses empty file', () => {
      const result = parseTasksFile('');
      expect(result.activeTasks).toEqual([]);
      expect(result.completedTasks).toEqual([]);
    });

    it('parses file with null/undefined', () => {
      expect(parseTasksFile(null).activeTasks).toEqual([]);
      expect(parseTasksFile(undefined).activeTasks).toEqual([]);
    });

    it('parses active tasks section', () => {
      const content = `# AgileFlow Tasks

## Active Tasks

### T-001: Write tests [pending]
- **Owner**: AG-API
- **Created**: 2026-02-20
- **Description**: Unit and integration tests`;

      const result = parseTasksFile(content);
      expect(result.activeTasks).toHaveLength(1);
      expect(result.activeTasks[0]).toEqual({
        id: 'T-001',
        title: 'Write tests',
        status: 'pending',
        owner: 'AG-API',
        created: '2026-02-20',
        completed: null,
        story: null,
        blockedBy: null,
        description: 'Unit and integration tests',
      });
    });

    it('parses completed tasks section', () => {
      const content = `# AgileFlow Tasks

## Completed Tasks

### T-002: Setup database [completed]
- **Owner**: AG-DEVOPS
- **Created**: 2026-02-19
- **Completed**: 2026-02-20`;

      const result = parseTasksFile(content);
      expect(result.completedTasks).toHaveLength(1);
      expect(result.completedTasks[0].id).toBe('T-002');
      expect(result.completedTasks[0].status).toBe('completed');
      expect(result.completedTasks[0].completed).toBe('2026-02-20');
    });

    it('parses multiple tasks in both sections', () => {
      const content = `# AgileFlow Tasks

## Active Tasks

### T-001: Task 1 [pending]
- **Owner**: AG-API

### T-002: Task 2 [in_progress]
- **Owner**: AG-UI

## Completed Tasks

### T-003: Task 3 [completed]
- **Owner**: AG-CI`;

      const result = parseTasksFile(content);
      expect(result.activeTasks).toHaveLength(2);
      expect(result.completedTasks).toHaveLength(1);
      expect(result.activeTasks[0].id).toBe('T-001');
      expect(result.activeTasks[1].id).toBe('T-002');
      expect(result.completedTasks[0].id).toBe('T-003');
    });

    it('parses all task fields', () => {
      const content = `# AgileFlow Tasks

## Active Tasks

### T-001: Complete task [blocked]
- **Owner**: AG-API
- **Created**: 2026-02-20
- **Story**: US-0042
- **Blocked by**: T-002
- **Description**: This task is blocked by T-002`;

      const result = parseTasksFile(content);
      const task = result.activeTasks[0];
      expect(task.owner).toBe('AG-API');
      expect(task.created).toBe('2026-02-20');
      expect(task.story).toBe('US-0042');
      expect(task.blockedBy).toBe('T-002');
      expect(task.description).toBe('This task is blocked by T-002');
    });

    it('handles missing optional fields', () => {
      const content = `# AgileFlow Tasks

## Active Tasks

### T-001: Minimal task [pending]`;

      const result = parseTasksFile(content);
      const task = result.activeTasks[0];
      expect(task.owner).toBeNull();
      expect(task.description).toBeNull();
      expect(task.story).toBeNull();
    });

    it('ignores non-task content', () => {
      const content = `# AgileFlow Tasks

> This is a comment
> Last updated: 2026-02-20T15:00:00Z

## Active Tasks

Some random text here

### T-001: Real task [pending]

More text that's not a task`;

      const result = parseTasksFile(content);
      expect(result.activeTasks).toHaveLength(1);
      expect(result.activeTasks[0].id).toBe('T-001');
    });
  });

  describe('formatTasksFile', () => {
    it('formats empty task lists', () => {
      const content = formatTasksFile([], []);
      expect(content).toContain('# AgileFlow Tasks');
      expect(content).toContain('Last updated:');
    });

    it('formats active tasks section', () => {
      const task = {
        id: 'T-001',
        title: 'Test task',
        status: 'pending',
        owner: 'AG-API',
        created: '2026-02-20',
        completed: null,
        story: null,
        blockedBy: null,
        description: 'Task description',
      };

      const content = formatTasksFile([task], []);
      expect(content).toContain('## Active Tasks');
      expect(content).toContain('### T-001: Test task [pending]');
      expect(content).toContain('- **Owner**: AG-API');
      expect(content).toContain('- **Description**: Task description');
    });

    it('formats completed tasks section', () => {
      const task = {
        id: 'T-002',
        title: 'Completed task',
        status: 'completed',
        owner: 'AG-CI',
        created: '2026-02-19',
        completed: '2026-02-20',
        story: null,
        blockedBy: null,
        description: null,
      };

      const content = formatTasksFile([], [task]);
      expect(content).toContain('## Completed Tasks');
      expect(content).toContain('### T-002: Completed task [completed]');
      expect(content).toContain('- **Completed**: 2026-02-20');
    });

    it('omits null fields from output', () => {
      const task = {
        id: 'T-001',
        title: 'Task',
        status: 'pending',
        owner: null,
        created: '2026-02-20',
        completed: null,
        story: null,
        blockedBy: null,
        description: null,
      };

      const content = formatTasksFile([task], []);
      expect(content).not.toContain('**Owner**');
      expect(content).not.toContain('**Description**');
    });

    it('round-trip: format then parse returns same data', () => {
      const original = {
        id: 'T-001',
        title: 'Round trip test',
        status: 'in_progress',
        owner: 'AG-API',
        created: '2026-02-20',
        completed: null,
        story: 'US-0040',
        blockedBy: 'T-002',
        description: 'Test description',
      };

      const content = formatTasksFile([original], []);
      const parsed = parseTasksFile(content);

      expect(parsed.activeTasks[0]).toEqual(original);
    });
  });

  describe('loadTasks', () => {
    it('returns empty lists for missing file', () => {
      const result = loadTasks(tempDir);
      expect(result.activeTasks).toEqual([]);
      expect(result.completedTasks).toEqual([]);
    });

    it('loads existing tasks file', () => {
      const agileflowDir = path.join(tempDir, 'test1', '.agileflow');
      const tasksPath = path.join(tempDir, 'test1', '.agileflow', 'tasks.md');
      fs.mkdirSync(agileflowDir, { recursive: true });

      const content = `# AgileFlow Tasks

## Active Tasks

### T-001: Task [pending]
- **Owner**: AG-API`;

      fs.writeFileSync(tasksPath, content, 'utf8');

      const result = loadTasks(path.join(tempDir, 'test1'));
      expect(result.activeTasks).toHaveLength(1);
      expect(result.activeTasks[0].id).toBe('T-001');
    });

    it('handles read errors gracefully', () => {
      const testDir = path.join(tempDir, 'test2');
      fs.mkdirSync(testDir, { recursive: true });

      // Create a directory instead of a file to cause read error
      const tasksPath = path.join(testDir, '.agileflow', 'tasks.md');
      fs.mkdirSync(path.dirname(tasksPath), { recursive: true });
      fs.mkdirSync(tasksPath, { recursive: true });

      const result = loadTasks(testDir);
      expect(result.activeTasks).toEqual([]);
      expect(result.completedTasks).toEqual([]);
    });
  });

  describe('saveTasks', () => {
    it('creates .agileflow directory if missing', () => {
      const testDir = path.join(tempDir, 'test3');
      fs.mkdirSync(testDir, { recursive: true });

      const result = saveTasks(testDir, { activeTasks: [], completedTasks: [] });
      expect(result).toBe(true);

      const tasksPath = path.join(testDir, '.agileflow', 'tasks.md');
      expect(fs.existsSync(tasksPath)).toBe(true);
    });

    it('writes tasks to file', () => {
      const testDir = path.join(tempDir, 'test4');
      fs.mkdirSync(testDir, { recursive: true });

      const task = {
        id: 'T-001',
        title: 'Test',
        status: 'pending',
        owner: 'AG-API',
        created: '2026-02-20',
        completed: null,
        story: null,
        blockedBy: null,
        description: 'Description',
      };

      const result = saveTasks(testDir, { activeTasks: [task], completedTasks: [] });
      expect(result).toBe(true);

      const tasksPath = path.join(testDir, '.agileflow', 'tasks.md');
      const content = fs.readFileSync(tasksPath, 'utf8');
      expect(content).toContain('T-001');
      expect(content).toContain('Test');
    });
  });

  describe('getNextId', () => {
    it('returns T-001 for empty list', () => {
      expect(getNextId([])).toBe('T-001');
    });

    it('increments existing IDs', () => {
      const tasks = [{ id: 'T-001' }, { id: 'T-002' }, { id: 'T-003' }];
      expect(getNextId(tasks)).toBe('T-004');
    });

    it('handles non-sequential IDs', () => {
      const tasks = [{ id: 'T-001' }, { id: 'T-005' }, { id: 'T-003' }];
      expect(getNextId(tasks)).toBe('T-006');
    });

    it('pads with zeros', () => {
      const tasks = Array.from({ length: 9 }, (_, i) => ({
        id: `T-${String(i + 1).padStart(3, '0')}`,
      }));
      expect(getNextId(tasks)).toBe('T-010');
    });

    it('returns T-001 for null or undefined', () => {
      expect(getNextId(null)).toBe('T-001');
      expect(getNextId(undefined)).toBe('T-001');
    });
  });

  describe('addTask', () => {
    it('creates new task with defaults', () => {
      const testDir = path.join(tempDir, 'test5');
      fs.mkdirSync(testDir, { recursive: true });

      const result = addTask(testDir, { subject: 'New task' });
      expect(result.ok).toBe(true);
      expect(result.taskId).toBe('T-001');

      const task = getTask(testDir, 'T-001');
      expect(task.title).toBe('New task');
      expect(task.status).toBe('pending');
    });

    it('creates task with all fields', () => {
      const testDir = path.join(tempDir, 'test6');
      fs.mkdirSync(testDir, { recursive: true });

      const result = addTask(testDir, {
        subject: 'Complex task',
        description: 'Task details',
        owner: 'AG-API',
        status: 'in_progress',
        story: 'US-0040',
        blockedBy: 'T-005',
      });

      expect(result.ok).toBe(true);
      const task = getTask(testDir, 'T-001');
      expect(task.title).toBe('Complex task');
      expect(task.description).toBe('Task details');
      expect(task.owner).toBe('AG-API');
      expect(task.status).toBe('in_progress');
      expect(task.story).toBe('US-0040');
      expect(task.blockedBy).toBe('T-005');
    });

    it('auto-increments task ID', () => {
      const testDir = path.join(tempDir, 'test7');
      fs.mkdirSync(testDir, { recursive: true });

      addTask(testDir, { subject: 'Task 1' });
      addTask(testDir, { subject: 'Task 2' });
      const result = addTask(testDir, { subject: 'Task 3' });

      expect(result.taskId).toBe('T-003');
    });

    it('rejects invalid status', () => {
      const testDir = path.join(tempDir, 'test8');
      fs.mkdirSync(testDir, { recursive: true });

      const result = addTask(testDir, {
        subject: 'Bad task',
        status: 'invalid_status',
      });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Invalid status');
    });

    it('adds completed task to correct section', () => {
      const testDir = path.join(tempDir, 'test9');
      fs.mkdirSync(testDir, { recursive: true });

      const result = addTask(testDir, {
        subject: 'Completed task',
        status: 'completed',
      });

      expect(result.ok).toBe(true);
      const { activeTasks, completedTasks } = loadTasks(testDir);
      expect(activeTasks).toHaveLength(0);
      expect(completedTasks).toHaveLength(1);
    });
  });

  describe('updateTask', () => {
    it('updates status', () => {
      const testDir = path.join(tempDir, 'test10');
      fs.mkdirSync(testDir, { recursive: true });

      addTask(testDir, { subject: 'Task', status: 'pending' });
      const result = updateTask(testDir, 'T-001', { status: 'in_progress' });

      expect(result.ok).toBe(true);
      const task = getTask(testDir, 'T-001');
      expect(task.status).toBe('in_progress');
    });

    it('moves task between sections on status change', () => {
      const testDir = path.join(tempDir, 'test11');
      fs.mkdirSync(testDir, { recursive: true });

      addTask(testDir, { subject: 'Task', status: 'pending' });
      updateTask(testDir, 'T-001', { status: 'completed' });

      const { activeTasks, completedTasks } = loadTasks(testDir);
      expect(activeTasks).toHaveLength(0);
      expect(completedTasks).toHaveLength(1);
      expect(completedTasks[0].completed).toBeDefined();
    });

    it('updates multiple fields at once', () => {
      const testDir = path.join(tempDir, 'test12');
      fs.mkdirSync(testDir, { recursive: true });

      addTask(testDir, { subject: 'Task' });
      const result = updateTask(testDir, 'T-001', {
        title: 'Updated title',
        status: 'in_progress',
        owner: 'AG-API',
        description: 'New description',
      });

      expect(result.ok).toBe(true);
      const task = getTask(testDir, 'T-001');
      expect(task.title).toBe('Updated title');
      expect(task.status).toBe('in_progress');
      expect(task.owner).toBe('AG-API');
      expect(task.description).toBe('New description');
    });

    it('handles non-existent task', () => {
      const testDir = path.join(tempDir, 'test13');
      fs.mkdirSync(testDir, { recursive: true });

      const result = updateTask(testDir, 'T-999', { status: 'pending' });
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('rejects invalid status', () => {
      const testDir = path.join(tempDir, 'test14');
      fs.mkdirSync(testDir, { recursive: true });

      addTask(testDir, { subject: 'Task' });
      const result = updateTask(testDir, 'T-001', { status: 'bad_status' });

      expect(result.ok).toBe(false);
      expect(result.error).toContain('Invalid status');
    });

    it('preserves fields not being updated', () => {
      const testDir = path.join(tempDir, 'test15');
      fs.mkdirSync(testDir, { recursive: true });

      addTask(testDir, {
        subject: 'Task',
        owner: 'AG-API',
        description: 'Original',
      });

      updateTask(testDir, 'T-001', { status: 'in_progress' });

      const task = getTask(testDir, 'T-001');
      expect(task.owner).toBe('AG-API');
      expect(task.description).toBe('Original');
    });
  });

  describe('deleteTask', () => {
    it('deletes active task', () => {
      const testDir = path.join(tempDir, 'test16');
      fs.mkdirSync(testDir, { recursive: true });

      addTask(testDir, { subject: 'Task' });
      const result = deleteTask(testDir, 'T-001');

      expect(result.ok).toBe(true);
      const task = getTask(testDir, 'T-001');
      expect(task).toBeNull();
    });

    it('deletes completed task', () => {
      const testDir = path.join(tempDir, 'test17');
      fs.mkdirSync(testDir, { recursive: true });

      addTask(testDir, { subject: 'Task', status: 'completed' });
      const result = deleteTask(testDir, 'T-001');

      expect(result.ok).toBe(true);
      const { completedTasks } = loadTasks(testDir);
      expect(completedTasks).toHaveLength(0);
    });

    it('handles non-existent task', () => {
      const testDir = path.join(tempDir, 'test18');
      fs.mkdirSync(testDir, { recursive: true });

      const result = deleteTask(testDir, 'T-999');
      expect(result.ok).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('getTask', () => {
    it('retrieves active task', () => {
      const testDir = path.join(tempDir, 'test19');
      fs.mkdirSync(testDir, { recursive: true });

      addTask(testDir, { subject: 'Task', owner: 'AG-API' });
      const task = getTask(testDir, 'T-001');

      expect(task).not.toBeNull();
      expect(task.id).toBe('T-001');
      expect(task.owner).toBe('AG-API');
    });

    it('retrieves completed task', () => {
      const testDir = path.join(tempDir, 'test20');
      fs.mkdirSync(testDir, { recursive: true });

      addTask(testDir, { subject: 'Task', status: 'completed' });
      const task = getTask(testDir, 'T-001');

      expect(task).not.toBeNull();
      expect(task.status).toBe('completed');
    });

    it('returns null for missing task', () => {
      const testDir = path.join(tempDir, 'test21');
      fs.mkdirSync(testDir, { recursive: true });

      const task = getTask(testDir, 'T-999');
      expect(task).toBeNull();
    });
  });

  describe('listTasks', () => {
    beforeEach(() => {
      // Setup: create multiple tasks for filtering tests
      const testDir = path.join(tempDir, 'test22');
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true });
      }
      // Only run setup once
      if (!fs.existsSync(path.join(testDir, '.agileflow', 'tasks.md'))) {
        addTask(testDir, { subject: 'Pending task', status: 'pending', owner: 'AG-API' });
        addTask(testDir, { subject: 'In progress', status: 'in_progress', owner: 'AG-UI' });
        addTask(testDir, { subject: 'Completed task', status: 'completed', owner: 'AG-CI' });
        addTask(testDir, { subject: 'Another pending', status: 'pending', owner: 'AG-API' });
      }
    });

    it('lists active tasks by default', () => {
      const testDir = path.join(tempDir, 'test22');
      const tasks = listTasks(testDir);

      expect(tasks).toHaveLength(3); // pending, in_progress, and another pending
      expect(tasks.every(t => ['pending', 'in_progress', 'blocked'].includes(t.status))).toBe(true);
    });

    it('filters by status', () => {
      const testDir = path.join(tempDir, 'test22');
      const tasks = listTasks(testDir, { status: 'pending', includeCompleted: true });

      expect(tasks).toHaveLength(2);
      expect(tasks.every(t => t.status === 'pending')).toBe(true);
    });

    it('filters by owner', () => {
      const testDir = path.join(tempDir, 'test22');
      const tasks = listTasks(testDir, { owner: 'AG-API', includeCompleted: true });

      expect(tasks).toHaveLength(2);
      expect(tasks.every(t => t.owner === 'AG-API')).toBe(true);
    });

    it('includes completed tasks when requested', () => {
      const testDir = path.join(tempDir, 'test22');
      const tasks = listTasks(testDir, { includeCompleted: true });

      expect(tasks.length).toBeGreaterThanOrEqual(4);
      expect(tasks.some(t => t.status === 'completed')).toBe(true);
    });

    it('filters by multiple criteria', () => {
      const testDir = path.join(tempDir, 'test22');
      const tasks = listTasks(testDir, {
        status: 'pending',
        owner: 'AG-API',
        includeCompleted: true,
      });

      expect(tasks).toHaveLength(2);
      expect(tasks.every(t => t.status === 'pending' && t.owner === 'AG-API')).toBe(true);
    });
  });

  describe('Round-trip integration tests', () => {
    it('create -> read -> modify -> write -> read returns consistent data', () => {
      const testDir = path.join(tempDir, 'test23');
      fs.mkdirSync(testDir, { recursive: true });

      // Create
      addTask(testDir, {
        subject: 'Integration test',
        owner: 'AG-API',
        status: 'pending',
        description: 'Original description',
      });

      // Read
      let task = getTask(testDir, 'T-001');
      expect(task.description).toBe('Original description');

      // Modify
      updateTask(testDir, 'T-001', {
        status: 'in_progress',
        description: 'Updated description',
      });

      // Read again
      task = getTask(testDir, 'T-001');
      expect(task.status).toBe('in_progress');
      expect(task.description).toBe('Updated description');

      // Write (implicit in updateTask)
      // Read from file directly
      const { activeTasks } = loadTasks(testDir);
      const loaded = activeTasks.find(t => t.id === 'T-001');
      expect(loaded.status).toBe('in_progress');
    });

    it('handles complex workflow: create -> update -> complete -> query', () => {
      const testDir = path.join(tempDir, 'test24');
      fs.mkdirSync(testDir, { recursive: true });

      // Create multiple tasks
      addTask(testDir, { subject: 'Task 1', owner: 'AG-API', status: 'pending' });
      addTask(testDir, { subject: 'Task 2', owner: 'AG-UI', status: 'pending' });
      addTask(testDir, { subject: 'Task 3', owner: 'AG-CI', status: 'pending' });

      // Update and complete some
      updateTask(testDir, 'T-001', { status: 'in_progress' });
      updateTask(testDir, 'T-002', { status: 'completed' });

      // Query active tasks for AG-API
      const apiTasks = listTasks(testDir, { owner: 'AG-API' });
      expect(apiTasks).toHaveLength(1);
      expect(apiTasks[0].status).toBe('in_progress');

      // Query all active
      const activeTasks = listTasks(testDir);
      expect(activeTasks.length).toBeGreaterThanOrEqual(2);
    });
  });
});
