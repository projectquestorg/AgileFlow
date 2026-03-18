/**
 * workspace-task-registry.js - Workspace-Level Task Registry
 *
 * Extends the TaskRegistry pattern with a `project` metadata field for
 * cross-project task tracking. Reuses the existing TaskRegistry class
 * with workspace-scoped state.
 *
 * State file:
 *   .agileflow-workspace/state/workspace-tasks.json
 *
 * Key differences from per-project TaskRegistry:
 * - Tasks have a `project` field identifying which project they belong to
 * - Task IDs are globally unique across projects
 * - Can query tasks grouped by project
 * - Supports cross-project dependencies (task in project A blocks task in project B)
 *
 * Usage:
 *   const { WorkspaceTaskRegistry } = require('./workspace-task-registry');
 *   const reg = new WorkspaceTaskRegistry('/path/to/workspace');
 *   reg.create({ description: 'Build auth API', project: 'backend', subagent_type: 'agileflow-api' });
 */

'use strict';

const path = require('path');
const { TaskRegistry } = require('./task-registry');
const { WORKSPACE_DIR } = require('./workspace-discovery');

// INVARIANT: These must remain relative paths. TaskRegistry joins them with
// rootDir via path.join(rootDir, statePath). An absolute path here would
// silently ignore rootDir on POSIX systems.
const WORKSPACE_STATE_DIR = 'state';
const WORKSPACE_TASKS_FILE = 'workspace-tasks.json';

/**
 * WorkspaceTaskRegistry - Cross-project task tracking
 *
 * Extends TaskRegistry with project awareness. Uses workspace-scoped
 * state directory instead of per-project state.
 */
class WorkspaceTaskRegistry extends TaskRegistry {
  /**
   * @param {string} workspaceRoot - Workspace root directory
   * @param {object} [options] - Options (passed to TaskRegistry)
   */
  constructor(workspaceRoot, options = {}) {
    const stateDir = path.join(WORKSPACE_DIR, WORKSPACE_STATE_DIR);
    super({
      rootDir: workspaceRoot,
      statePath: path.join(stateDir, WORKSPACE_TASKS_FILE),
      ...options,
    });

    this.workspaceRoot = workspaceRoot;
  }

  /**
   * Create a workspace task with project metadata.
   *
   * @param {object} taskData - Task data (same as TaskRegistry.create plus `project`)
   * @param {string} taskData.project - Project name this task belongs to
   * @returns {{ success: boolean, task?: object, error?: string }}
   */
  create(taskData) {
    // Inject project into metadata
    const enrichedData = {
      ...taskData,
      metadata: {
        ...(taskData.metadata || {}),
        project: taskData.project || null,
        workspace: true,
      },
    };

    return super.create(enrichedData);
  }

  /**
   * Get all tasks for a specific project.
   *
   * @param {string} projectName - Project name
   * @returns {object[]}
   */
  getTasksForProject(projectName) {
    const allTasks = this.getAll();
    return allTasks.filter(t => t.metadata && t.metadata.project === projectName);
  }

  /**
   * Get tasks grouped by project.
   *
   * @returns {{ [project: string]: object[] }}
   */
  getTasksByProject() {
    const allTasks = this.getAll();
    const grouped = {};

    for (const task of allTasks) {
      const project = (task.metadata && task.metadata.project) || 'unknown';
      if (!grouped[project]) grouped[project] = [];
      grouped[project].push(task);
    }

    return grouped;
  }

  /**
   * Get workspace-level statistics including per-project breakdown.
   *
   * @returns {object}
   */
  getWorkspaceStats() {
    const baseStats = this.getStats();
    const byProject = {};

    const allTasks = this.getAll();
    for (const task of allTasks) {
      const project = (task.metadata && task.metadata.project) || 'unknown';
      if (!byProject[project]) {
        byProject[project] = { total: 0, by_state: {} };
      }
      byProject[project].total++;
      const state = task.state || 'unknown';
      byProject[project].by_state[state] = (byProject[project].by_state[state] || 0) + 1;
    }

    return {
      ...baseStats,
      by_project: byProject,
    };
  }

  /**
   * Get cross-project dependencies.
   * Finds tasks where blockedBy references tasks in a different project.
   *
   * @returns {{ from: { id: string, project: string }, to: { id: string, project: string } }[]}
   */
  getCrossProjectDependencies() {
    const state = this.load();
    const deps = [];

    for (const task of Object.values(state.tasks)) {
      const taskProject = (task.metadata && task.metadata.project) || 'unknown';

      for (const blockerId of task.blockedBy || []) {
        const blocker = state.tasks[blockerId];
        if (!blocker) continue;

        const blockerProject = (blocker.metadata && blocker.metadata.project) || 'unknown';

        if (taskProject !== blockerProject) {
          deps.push({
            from: { id: blockerId, project: blockerProject },
            to: { id: task.id, project: taskProject },
          });
        }
      }
    }

    return deps;
  }
}

// Singleton
let _instance = null;

/**
 * Get singleton workspace task registry.
 * @param {string} workspaceRoot - Workspace root directory
 * @param {object} [options] - Options
 * @returns {WorkspaceTaskRegistry}
 */
function getWorkspaceTaskRegistry(workspaceRoot, options = {}) {
  if (!_instance || options.forceNew) {
    _instance = new WorkspaceTaskRegistry(workspaceRoot, options);
  } else if (path.resolve(_instance.workspaceRoot) !== path.resolve(workspaceRoot)) {
    _instance = new WorkspaceTaskRegistry(workspaceRoot, options);
  }
  return _instance;
}

/**
 * Reset singleton (for testing).
 */
function resetWorkspaceTaskRegistry() {
  _instance = null;
}

module.exports = {
  WorkspaceTaskRegistry,
  getWorkspaceTaskRegistry,
  resetWorkspaceTaskRegistry,
};
