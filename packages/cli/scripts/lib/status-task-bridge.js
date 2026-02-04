/**
 * status-task-bridge.js - Bridge between task-registry and status.json
 *
 * Provides utilities to:
 * - Link tasks to stories (task_ids field)
 * - Query tasks by story
 * - Sync task state to status.json
 * - Migrate existing status.json files to include tasks section
 *
 * This module connects the multi-agent task orchestration system
 * with the existing AgileFlow story tracking in status.json.
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Import task registry
let getTaskRegistry;
try {
  getTaskRegistry = require('./task-registry').getTaskRegistry;
} catch (e) {
  // Fallback for testing
  getTaskRegistry = () => null;
}

// ============================================================================
// Constants
// ============================================================================

const STATUS_PATH = 'docs/09-agents/status.json';
const TASKS_SCHEMA_VERSION = '1.0.0';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Find project root by looking for .agileflow directory
 * @returns {string} Project root path
 */
function findProjectRoot() {
  let dir = process.cwd();
  while (dir !== '/' && dir !== path.parse(dir).root) {
    if (fs.existsSync(path.join(dir, '.agileflow'))) {
      return dir;
    }
    if (fs.existsSync(path.join(dir, 'docs', '09-agents', 'status.json'))) {
      return dir;
    }
    dir = path.dirname(dir);
  }
  return process.cwd();
}

/**
 * Safe JSON parse with default
 * @param {string} content - JSON string
 * @param {*} defaultValue - Default if parse fails
 * @returns {*}
 */
function safeJSONParse(content, defaultValue = null) {
  try {
    return JSON.parse(content);
  } catch (e) {
    return defaultValue;
  }
}

/**
 * Load status.json from project
 * @param {string} [projectRoot] - Optional project root
 * @returns {Object|null} Status data or null
 */
function loadStatus(projectRoot = null) {
  const root = projectRoot || findProjectRoot();
  const statusPath = path.join(root, STATUS_PATH);

  if (!fs.existsSync(statusPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(statusPath, 'utf8');
    return safeJSONParse(content, null);
  } catch (e) {
    return null;
  }
}

/**
 * Save status.json to project
 * @param {Object} statusData - Status data to save
 * @param {string} [projectRoot] - Optional project root
 * @returns {boolean} Success
 */
function saveStatus(statusData, projectRoot = null) {
  const root = projectRoot || findProjectRoot();
  const statusPath = path.join(root, STATUS_PATH);

  try {
    statusData.updated_at = new Date().toISOString();
    fs.writeFileSync(statusPath, JSON.stringify(statusData, null, 2) + '\n');
    return true;
  } catch (e) {
    return false;
  }
}

// ============================================================================
// Migration
// ============================================================================

/**
 * Migrate status.json to include tasks section
 * @param {Object} statusData - Status data to migrate
 * @returns {Object} Migrated status data
 */
function migrateToTasksSchema(statusData) {
  if (!statusData) return statusData;

  // Add tasks section if not present
  if (!statusData.tasks) {
    statusData.tasks = {
      _schema_version: TASKS_SCHEMA_VERSION,
      _migrated_at: new Date().toISOString(),
    };
  }

  // Add task_ids field to stories if not present
  if (statusData.stories) {
    for (const story of Object.values(statusData.stories)) {
      if (!story.task_ids) {
        story.task_ids = [];
      }
    }
  }

  return statusData;
}

/**
 * Check if status.json needs migration
 * @param {Object} statusData - Status data to check
 * @returns {boolean}
 */
function needsMigration(statusData) {
  if (!statusData) return false;
  return !statusData.tasks;
}

// ============================================================================
// Task-Story Linking
// ============================================================================

/**
 * Link a task to a story in status.json
 * @param {string} storyId - Story ID (e.g., 'US-0123')
 * @param {string} taskId - Task ID from task-registry
 * @param {string} [projectRoot] - Optional project root
 * @returns {{ success: boolean, error?: string }}
 */
function linkTaskToStory(storyId, taskId, projectRoot = null) {
  const statusData = loadStatus(projectRoot);
  if (!statusData) {
    return { success: false, error: 'Could not load status.json' };
  }

  // Migrate if needed
  migrateToTasksSchema(statusData);

  // Check story exists
  if (!statusData.stories || !statusData.stories[storyId]) {
    return { success: false, error: `Story ${storyId} not found` };
  }

  const story = statusData.stories[storyId];

  // Initialize task_ids if needed
  if (!story.task_ids) {
    story.task_ids = [];
  }

  // Add task if not already linked
  if (!story.task_ids.includes(taskId)) {
    story.task_ids.push(taskId);
  }

  // Store task reference in tasks section
  if (!statusData.tasks[taskId]) {
    statusData.tasks[taskId] = {
      story_id: storyId,
      linked_at: new Date().toISOString(),
    };
  }

  saveStatus(statusData, projectRoot);

  return { success: true };
}

/**
 * Unlink a task from a story
 * @param {string} storyId - Story ID
 * @param {string} taskId - Task ID
 * @param {string} [projectRoot] - Optional project root
 * @returns {{ success: boolean, error?: string }}
 */
function unlinkTaskFromStory(storyId, taskId, projectRoot = null) {
  const statusData = loadStatus(projectRoot);
  if (!statusData) {
    return { success: false, error: 'Could not load status.json' };
  }

  if (!statusData.stories || !statusData.stories[storyId]) {
    return { success: false, error: `Story ${storyId} not found` };
  }

  const story = statusData.stories[storyId];

  // Remove from task_ids
  if (story.task_ids) {
    story.task_ids = story.task_ids.filter(id => id !== taskId);
  }

  // Remove from tasks section
  if (statusData.tasks && statusData.tasks[taskId]) {
    delete statusData.tasks[taskId];
  }

  saveStatus(statusData, projectRoot);

  return { success: true };
}

/**
 * Get all tasks for a story
 * @param {string} storyId - Story ID
 * @param {string} [projectRoot] - Optional project root
 * @returns {{ tasks: Object[], story: Object | null }}
 */
function getTasksForStory(storyId, projectRoot = null) {
  const root = projectRoot || findProjectRoot();
  const statusData = loadStatus(root);

  if (!statusData || !statusData.stories || !statusData.stories[storyId]) {
    return { tasks: [], story: null };
  }

  const story = statusData.stories[storyId];
  const taskIds = story.task_ids || [];

  // Get task details from task-registry
  const registry = getTaskRegistry({ rootDir: root });
  const tasks = [];

  if (registry) {
    for (const taskId of taskIds) {
      const task = registry.get(taskId);
      if (task) {
        tasks.push(task);
      }
    }
  }

  return { tasks, story };
}

/**
 * Get story progress based on tasks
 * @param {string} storyId - Story ID
 * @param {string} [projectRoot] - Optional project root
 * @returns {{ total: number, completed: number, failed: number, running: number, percentage: number }}
 */
function getStoryTaskProgress(storyId, projectRoot = null) {
  const { tasks } = getTasksForStory(storyId, projectRoot);

  const result = {
    total: tasks.length,
    completed: 0,
    failed: 0,
    running: 0,
    queued: 0,
    blocked: 0,
    percentage: 0,
  };

  for (const task of tasks) {
    switch (task.state) {
      case 'completed':
        result.completed++;
        break;
      case 'failed':
        result.failed++;
        break;
      case 'running':
        result.running++;
        break;
      case 'queued':
        result.queued++;
        break;
      case 'blocked':
        result.blocked++;
        break;
    }
  }

  if (result.total > 0) {
    result.percentage = Math.round((result.completed / result.total) * 100);
  }

  return result;
}

// ============================================================================
// Query Functions
// ============================================================================

/**
 * Get all stories with their task counts
 * @param {Object} [filter] - Optional filter
 * @param {string} [projectRoot] - Optional project root
 * @returns {Object[]}
 */
function getStoriesWithTaskCounts(filter = {}, projectRoot = null) {
  const root = projectRoot || findProjectRoot();
  const statusData = loadStatus(root);

  if (!statusData || !statusData.stories) {
    return [];
  }

  const results = [];

  for (const [storyId, story] of Object.entries(statusData.stories)) {
    // Apply filters
    if (filter.status && story.status !== filter.status) continue;
    if (filter.epic && story.epic !== filter.epic) continue;

    const progress = getStoryTaskProgress(storyId, root);

    results.push({
      id: storyId,
      title: story.title,
      status: story.status,
      epic: story.epic,
      task_count: progress.total,
      tasks_completed: progress.completed,
      tasks_failed: progress.failed,
      tasks_running: progress.running,
      task_progress: progress.percentage,
    });
  }

  return results;
}

/**
 * Get all in-progress stories with running tasks
 * @param {string} [projectRoot] - Optional project root
 * @returns {Object[]}
 */
function getActiveStoriesWithTasks(projectRoot = null) {
  return getStoriesWithTaskCounts({ status: 'in_progress' }, projectRoot).filter(
    s => s.task_count > 0
  );
}

/**
 * Sync task completion state to story
 * When all tasks for a story are complete, optionally update story status
 * @param {string} storyId - Story ID
 * @param {Object} [options] - Options
 * @param {string} [projectRoot] - Optional project root
 * @returns {{ updated: boolean, message: string }}
 */
function syncTaskCompletionToStory(storyId, options = {}, projectRoot = null) {
  const { autoComplete = false } = options;
  const root = projectRoot || findProjectRoot();
  const statusData = loadStatus(root);

  if (!statusData || !statusData.stories || !statusData.stories[storyId]) {
    return { updated: false, message: `Story ${storyId} not found` };
  }

  const story = statusData.stories[storyId];
  const progress = getStoryTaskProgress(storyId, root);

  // Check if all tasks complete
  if (progress.total > 0 && progress.completed === progress.total) {
    if (autoComplete && story.status !== 'completed' && story.status !== 'done') {
      story.status = 'completed';
      story.completed_at = new Date().toISOString();
      story.notes = (story.notes || '') + `\nAuto-completed: All ${progress.total} tasks finished.`;
      saveStatus(statusData, root);

      return {
        updated: true,
        message: `Story ${storyId} auto-completed (${progress.total} tasks done)`,
      };
    }

    return {
      updated: false,
      message: `All ${progress.total} tasks complete for ${storyId}`,
    };
  }

  if (progress.failed > 0) {
    return {
      updated: false,
      message: `Story ${storyId} has ${progress.failed} failed task(s)`,
    };
  }

  return {
    updated: false,
    message: `Story ${storyId}: ${progress.completed}/${progress.total} tasks complete`,
  };
}

// ============================================================================
// Task State Snapshot
// ============================================================================

/**
 * Create a snapshot of all tasks for a story (for status.json)
 * @param {string} storyId - Story ID
 * @param {string} [projectRoot] - Optional project root
 * @returns {Object} Snapshot object
 */
function createTaskSnapshot(storyId, projectRoot = null) {
  const { tasks, story } = getTasksForStory(storyId, projectRoot);

  if (!story) {
    return null;
  }

  return {
    story_id: storyId,
    story_title: story.title,
    snapshot_at: new Date().toISOString(),
    task_count: tasks.length,
    tasks: tasks.map(t => ({
      id: t.id,
      description: t.description,
      subagent_type: t.subagent_type,
      state: t.state,
      blockedBy: t.blockedBy,
      error: t.error,
    })),
  };
}

/**
 * Store task snapshot in status.json tasks section
 * Useful for PreCompact context preservation
 * @param {string} storyId - Story ID
 * @param {string} [projectRoot] - Optional project root
 * @returns {{ success: boolean, snapshot?: Object }}
 */
function saveTaskSnapshot(storyId, projectRoot = null) {
  const root = projectRoot || findProjectRoot();
  const statusData = loadStatus(root);

  if (!statusData) {
    return { success: false };
  }

  migrateToTasksSchema(statusData);

  const snapshot = createTaskSnapshot(storyId, root);
  if (!snapshot) {
    return { success: false };
  }

  // Store in tasks section
  if (!statusData.tasks._snapshots) {
    statusData.tasks._snapshots = {};
  }

  statusData.tasks._snapshots[storyId] = snapshot;

  saveStatus(statusData, root);

  return { success: true, snapshot };
}

// ============================================================================
// Exports
// ============================================================================

module.exports = {
  // Constants
  STATUS_PATH,
  TASKS_SCHEMA_VERSION,

  // Utilities
  findProjectRoot,
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
};
