/**
 * Tests for workspace-task-registry.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  WorkspaceTaskRegistry,
  getWorkspaceTaskRegistry,
  resetWorkspaceTaskRegistry,
} = require('../../../scripts/lib/workspace-task-registry');
const { WORKSPACE_DIR } = require('../../../scripts/lib/workspace-discovery');

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-task-test-'));
  fs.mkdirSync(path.join(tmpDir, WORKSPACE_DIR, 'state'), { recursive: true });
  resetWorkspaceTaskRegistry();
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
  resetWorkspaceTaskRegistry();
});

describe('WorkspaceTaskRegistry', () => {
  describe('create', () => {
    test('creates task with project metadata', () => {
      const reg = new WorkspaceTaskRegistry(tmpDir);
      const result = reg.create({
        description: 'Build auth API',
        project: 'backend',
        subagent_type: 'agileflow-api',
      });

      expect(result.success).toBe(true);
      expect(result.task.metadata.project).toBe('backend');
      expect(result.task.metadata.workspace).toBe(true);
    });

    test('creates tasks for multiple projects', () => {
      const reg = new WorkspaceTaskRegistry(tmpDir);
      reg.create({ description: 'API work', project: 'backend' });
      reg.create({ description: 'UI work', project: 'frontend' });
      reg.create({ description: 'More API', project: 'backend' });

      const all = reg.getAll();
      expect(all).toHaveLength(3);
    });
  });

  describe('getTasksForProject', () => {
    test('filters tasks by project', () => {
      const reg = new WorkspaceTaskRegistry(tmpDir);
      reg.create({ description: 'API work', project: 'backend' });
      reg.create({ description: 'UI work', project: 'frontend' });
      reg.create({ description: 'More API', project: 'backend' });

      const backendTasks = reg.getTasksForProject('backend');
      expect(backendTasks).toHaveLength(2);
      expect(backendTasks.every(t => t.metadata.project === 'backend')).toBe(true);

      const frontendTasks = reg.getTasksForProject('frontend');
      expect(frontendTasks).toHaveLength(1);
    });

    test('returns empty for unknown project', () => {
      const reg = new WorkspaceTaskRegistry(tmpDir);
      reg.create({ description: 'Test', project: 'backend' });

      expect(reg.getTasksForProject('nonexistent')).toEqual([]);
    });
  });

  describe('getTasksByProject', () => {
    test('groups tasks by project', () => {
      const reg = new WorkspaceTaskRegistry(tmpDir);
      reg.create({ description: 'A', project: 'backend' });
      reg.create({ description: 'B', project: 'frontend' });
      reg.create({ description: 'C', project: 'backend' });

      const grouped = reg.getTasksByProject();
      expect(Object.keys(grouped)).toEqual(expect.arrayContaining(['backend', 'frontend']));
      expect(grouped.backend).toHaveLength(2);
      expect(grouped.frontend).toHaveLength(1);
    });
  });

  describe('getWorkspaceStats', () => {
    test('includes per-project breakdown', () => {
      const reg = new WorkspaceTaskRegistry(tmpDir);
      reg.create({ description: 'A', project: 'backend' });
      reg.create({ description: 'B', project: 'frontend' });
      reg.create({ description: 'C', project: 'backend' });

      const stats = reg.getWorkspaceStats();
      expect(stats.total).toBe(3);
      expect(stats.by_project.backend.total).toBe(2);
      expect(stats.by_project.frontend.total).toBe(1);
    });

    test('includes state breakdown per project', () => {
      const reg = new WorkspaceTaskRegistry(tmpDir);
      const r1 = reg.create({ description: 'A', project: 'backend' });
      reg.create({ description: 'B', project: 'backend' });

      // Transition first task to running
      reg.transition(r1.task.id, 'running');

      const stats = reg.getWorkspaceStats();
      expect(stats.by_project.backend.by_state.running).toBe(1);
      expect(stats.by_project.backend.by_state.queued).toBe(1);
    });
  });

  describe('getCrossProjectDependencies', () => {
    test('detects cross-project dependencies', () => {
      const reg = new WorkspaceTaskRegistry(tmpDir);
      const dbTask = reg.create({ description: 'DB schema', project: 'backend' });
      reg.create({
        description: 'API endpoint',
        project: 'frontend',
        blockedBy: [dbTask.task.id],
      });

      const deps = reg.getCrossProjectDependencies();
      expect(deps).toHaveLength(1);
      expect(deps[0].from.project).toBe('backend');
      expect(deps[0].to.project).toBe('frontend');
    });

    test('ignores same-project dependencies', () => {
      const reg = new WorkspaceTaskRegistry(tmpDir);
      const t1 = reg.create({ description: 'Schema', project: 'backend' });
      reg.create({
        description: 'API',
        project: 'backend',
        blockedBy: [t1.task.id],
      });

      const deps = reg.getCrossProjectDependencies();
      expect(deps).toHaveLength(0);
    });
  });

  describe('singleton', () => {
    test('getWorkspaceTaskRegistry returns same instance', () => {
      const reg1 = getWorkspaceTaskRegistry(tmpDir);
      const reg2 = getWorkspaceTaskRegistry(tmpDir);
      expect(reg1).toBe(reg2);
    });

    test('forceNew creates new instance', () => {
      const reg1 = getWorkspaceTaskRegistry(tmpDir);
      const reg2 = getWorkspaceTaskRegistry(tmpDir, { forceNew: true });
      expect(reg1).not.toBe(reg2);
    });
  });
});
