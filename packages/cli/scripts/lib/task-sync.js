/**
 * task-sync.js - Bidirectional sync between status.json and native task list
 *
 * When Agent Teams is enabled, tasks exist in both:
 * 1. Native task list (Claude Code's ~/.claude/tasks/) - primary during team sessions
 * 2. status.json (AgileFlow's story tracker) - persistent record
 *
 * Write-through semantics: native first (locked), then sync to status.json.
 * On team cleanup, final states written back to status.json.
 *
 * Usage:
 *   const { syncToStatus, syncFromStatus, reconcile } = require('./lib/task-sync');
 */

const fs = require('fs');
const path = require('path');

// Lazy-load paths
let _paths;
function getPaths() {
  if (!_paths) {
    try {
      _paths = require('../../lib/paths');
    } catch (e) {
      return null;
    }
  }
  return _paths;
}

/**
 * Map AgileFlow story status to native task status.
 */
function storyStatusToTaskStatus(storyStatus) {
  const mapping = {
    'ready': 'pending',
    'in_progress': 'in_progress',
    'in_review': 'in_progress',
    'blocked': 'pending',
    'completed': 'completed',
  };
  return mapping[storyStatus] || 'pending';
}

/**
 * Map native task status back to AgileFlow story status.
 */
function taskStatusToStoryStatus(taskStatus) {
  const mapping = {
    'pending': 'ready',
    'in_progress': 'in_progress',
    'completed': 'completed',
  };
  return mapping[taskStatus] || 'ready';
}

/**
 * Read status.json stories.
 */
function readStatusStories(rootDir) {
  try {
    const paths = getPaths();
    const statusPath = paths ? paths.getStatusPath(rootDir) : path.join(rootDir, 'docs', '09-agents', 'status.json');

    if (!fs.existsSync(statusPath)) return {};

    const data = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    return data.stories || {};
  } catch (e) {
    return {};
  }
}

/**
 * Write status.json stories back.
 */
function writeStatusStories(rootDir, stories) {
  try {
    const paths = getPaths();
    const statusPath = paths ? paths.getStatusPath(rootDir) : path.join(rootDir, 'docs', '09-agents', 'status.json');

    let data = {};
    if (fs.existsSync(statusPath)) {
      data = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    }

    data.stories = stories;
    fs.writeFileSync(statusPath, JSON.stringify(data, null, 2) + '\n');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Sync a story update TO status.json (write-through from native task list).
 *
 * @param {string} rootDir - Project root
 * @param {string} storyId - Story ID (e.g., 'US-0042')
 * @param {object} updates - Fields to update { status, assigned_to, completed_at, ... }
 * @returns {{ ok: boolean }}
 */
function syncToStatus(rootDir, storyId, updates) {
  try {
    const paths = getPaths();
    const statusPath = paths ? paths.getStatusPath(rootDir) : path.join(rootDir, 'docs', '09-agents', 'status.json');

    if (!fs.existsSync(statusPath)) {
      return { ok: false, error: 'status.json not found' };
    }

    const data = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    if (!data.stories) data.stories = {};

    if (!data.stories[storyId]) {
      return { ok: false, error: `Story ${storyId} not found` };
    }

    // Apply updates
    Object.assign(data.stories[storyId], updates);

    // Update timestamp
    data.stories[storyId].updated_at = new Date().toISOString();

    fs.writeFileSync(statusPath, JSON.stringify(data, null, 2) + '\n');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Sync stories FROM status.json to native task format.
 * Returns task list entries for in-progress and ready stories.
 *
 * @param {string} rootDir - Project root
 * @param {object} [filters] - Filters { epic, status, owner }
 * @returns {{ ok: boolean, tasks: Array }}
 */
function syncFromStatus(rootDir, filters = {}) {
  try {
    const stories = readStatusStories(rootDir);
    const tasks = [];

    for (const [id, story] of Object.entries(stories)) {
      // Apply filters
      if (filters.epic && story.epic !== filters.epic) continue;
      if (filters.status && story.status !== filters.status) continue;
      if (filters.owner && story.owner !== filters.owner) continue;

      tasks.push({
        id,
        subject: `${id}: ${story.title}`,
        description: story.acceptance_criteria || story.description || '',
        status: storyStatusToTaskStatus(story.status),
        owner: story.owner || '',
        metadata: {
          story_id: id,
          epic: story.epic,
          original_status: story.status,
        },
      });
    }

    return { ok: true, tasks };
  } catch (e) {
    return { ok: false, error: e.message, tasks: [] };
  }
}

/**
 * Reconcile native task states back to status.json.
 * Called when a team session ends.
 *
 * @param {string} rootDir - Project root
 * @param {Array} nativeTasks - Array of { id, status, metadata } from native task list
 * @returns {{ ok: boolean, updated: number }}
 */
function reconcile(rootDir, nativeTasks) {
  let updated = 0;

  try {
    const paths = getPaths();
    const statusPath = paths ? paths.getStatusPath(rootDir) : path.join(rootDir, 'docs', '09-agents', 'status.json');

    if (!fs.existsSync(statusPath)) {
      return { ok: false, error: 'status.json not found', updated: 0 };
    }

    const data = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    if (!data.stories) data.stories = {};

    for (const task of nativeTasks) {
      const storyId = task.metadata?.story_id || task.id;
      if (!data.stories[storyId]) continue;

      const newStatus = taskStatusToStoryStatus(task.status);
      if (data.stories[storyId].status !== newStatus) {
        data.stories[storyId].status = newStatus;
        data.stories[storyId].updated_at = new Date().toISOString();

        if (newStatus === 'completed') {
          data.stories[storyId].completed_at = new Date().toISOString();
        }

        updated++;
      }
    }

    if (updated > 0) {
      fs.writeFileSync(statusPath, JSON.stringify(data, null, 2) + '\n');
    }

    return { ok: true, updated };
  } catch (e) {
    return { ok: false, error: e.message, updated: 0 };
  }
}

module.exports = {
  syncToStatus,
  syncFromStatus,
  reconcile,
  readStatusStories,
  writeStatusStories,
  storyStatusToTaskStatus,
  taskStatusToStoryStatus,
};
