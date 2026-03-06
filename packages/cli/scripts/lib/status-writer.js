/**
 * status-writer.js - Canonical write module for status.json mutations
 *
 * ALL status.json story updates should go through this module to ensure:
 * 1. Atomic read-modify-write via file-lock.js
 * 2. State machine validation on status transitions
 * 3. Automatic dependency resolution when stories complete
 *
 * Usage:
 *   const { updateStory, readStory } = require('./status-writer');
 *   updateStory(rootDir, 'US-0042', { status: 'completed' });
 */

'use strict';

const fs = require('fs');
const path = require('path');

// Lazy-load file-lock for atomic writes
let _fileLock;
function getFileLock() {
  if (_fileLock === undefined) {
    try {
      _fileLock = require('./file-lock');
    } catch (e) {
      _fileLock = null;
    }
  }
  return _fileLock;
}

// Lazy-load story-state-machine for transition validation
let _stateMachine;
function getStateMachine() {
  if (_stateMachine === undefined) {
    try {
      _stateMachine = require('./story-state-machine');
    } catch (e) {
      _stateMachine = null;
    }
  }
  return _stateMachine;
}

// Lazy-load paths module
let _paths;
function getPaths() {
  if (_paths === undefined) {
    try {
      _paths = require('../../lib/paths');
    } catch (e) {
      _paths = null;
    }
  }
  return _paths;
}

/**
 * Resolve the status.json file path for a given project root.
 * @param {string} rootDir - Project root directory
 * @returns {string} Absolute path to status.json
 */
function getStatusFilePath(rootDir) {
  const paths = getPaths();
  if (paths && typeof paths.getStatusPath === 'function') {
    return paths.getStatusPath(rootDir);
  }
  return path.join(rootDir, 'docs', '09-agents', 'status.json');
}

/**
 * Read a single story from status.json.
 *
 * @param {string} rootDir - Project root directory
 * @param {string} storyId - Story ID (e.g., 'US-0042')
 * @returns {{ ok: boolean, story?: object, error?: string }}
 */
function readStory(rootDir, storyId) {
  try {
    const statusPath = getStatusFilePath(rootDir);
    if (!fs.existsSync(statusPath)) {
      return { ok: false, error: 'status.json not found' };
    }

    const data = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
    if (!data.stories || !data.stories[storyId]) {
      return { ok: false, error: `Story ${storyId} not found` };
    }

    return { ok: true, story: data.stories[storyId] };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

/**
 * Resolve dependencies when a story transitions to completed/done.
 * Pure in-memory operation — mutates `data` in place.
 *
 * Iterates all stories, finds those with `depends_on` or `blocked_by`
 * containing `completedStoryId`. If all dependencies are now
 * completed/done, transitions the story from `blocked` → `ready`.
 *
 * @param {object} data - Full status.json data object (mutated in place)
 * @param {string} completedStoryId - The story that just completed
 * @returns {{ unblocked: string[] }} List of story IDs that were unblocked
 */
function resolveDependencies(data, completedStoryId) {
  const unblocked = [];
  if (!data || !data.stories) return { unblocked };

  const sm = getStateMachine();
  const completedStatuses = sm ? sm.COMPLETED_STATUSES : ['completed', 'archived'];

  // Helper: check if a story ID is in a completed/done state
  function isCompleted(sid) {
    const s = data.stories[sid];
    if (!s) return false;
    return completedStatuses.includes(s.status) || s.status === 'done';
  }

  for (const [storyId, story] of Object.entries(data.stories)) {
    // Only consider blocked stories
    if (story.status !== 'blocked') continue;

    // Collect dependency IDs from both fields
    const deps = [];
    if (Array.isArray(story.depends_on)) deps.push(...story.depends_on);
    if (Array.isArray(story.blocked_by)) deps.push(...story.blocked_by);

    // Skip stories that don't depend on the completed story
    if (!deps.includes(completedStoryId)) continue;

    // Check if ALL dependencies are now completed/done
    const allMet = deps.every(depId => isCompleted(depId));
    if (!allMet) continue;

    // Transition blocked → ready
    if (sm) {
      const result = sm.transition({ id: storyId, status: 'blocked' }, 'ready', {
        actor: 'status-writer',
        reason: `Dependencies resolved (${completedStoryId} completed)`,
      });
      if (result.success) {
        story.status = 'ready';
        story.updated_at = new Date().toISOString();
        unblocked.push(storyId);
      }
    } else {
      // No state machine available — direct transition
      story.status = 'ready';
      story.updated_at = new Date().toISOString();
      unblocked.push(storyId);
    }
  }

  return { unblocked };
}

/**
 * Update a single story in status.json using atomic read-modify-write.
 *
 * When `updates.status` is provided and differs from the current status,
 * validates the transition via story-state-machine. When transitioning
 * to completed/done, triggers resolveDependencies() automatically.
 *
 * @param {string} rootDir - Project root directory
 * @param {string} storyId - Story ID (e.g., 'US-0042')
 * @param {object} updates - Fields to update (e.g., { status: 'completed', assigned_to: 'AG-API' })
 * @param {object} [options={}] - Options
 * @param {boolean} [options.skipValidation=false] - Skip state machine validation
 * @returns {{ ok: boolean, unblocked?: string[], error?: string }}
 */
function updateStory(rootDir, storyId, updates, options = {}) {
  const { skipValidation = false } = options;

  try {
    const statusPath = getStatusFilePath(rootDir);
    if (!fs.existsSync(statusPath)) {
      return { ok: false, error: 'status.json not found' };
    }

    const fileLock = getFileLock();

    // Mutation function applied inside the lock
    let resultMeta = { unblocked: [] };

    const modifyFn = data => {
      if (!data.stories) data.stories = {};
      if (!data.stories[storyId]) {
        throw new Error(`Story ${storyId} not found`);
      }

      const story = data.stories[storyId];

      // Validate status transition if status is changing
      if (updates.status && updates.status !== story.status && !skipValidation) {
        const sm = getStateMachine();
        if (sm) {
          const valid = sm.isValidTransition(story.status, updates.status);
          if (!valid) {
            const validTargets = sm.getValidTransitions(story.status);
            throw new Error(
              `Invalid transition: ${story.status} → ${updates.status}. ` +
                `Valid transitions: ${validTargets.join(', ') || 'none'}`
            );
          }
        }
      }

      // Apply updates (null values delete the field)
      Object.assign(story, updates);
      for (const [key, val] of Object.entries(updates)) {
        if (val === null) delete story[key];
      }
      story.updated_at = new Date().toISOString();

      // Trigger dependency resolution on completion
      const sm = getStateMachine();
      const completedStatuses = sm ? sm.COMPLETED_STATUSES : ['completed', 'archived'];
      if (
        updates.status &&
        (completedStatuses.includes(updates.status) || updates.status === 'done')
      ) {
        const resolved = resolveDependencies(data, storyId);
        resultMeta.unblocked = resolved.unblocked;
      }

      return data;
    };

    if (fileLock && typeof fileLock.atomicReadModifyWrite === 'function') {
      const result = fileLock.atomicReadModifyWrite(statusPath, modifyFn);
      if (!result.success) {
        return { ok: false, error: result.error || 'Atomic write failed' };
      }
    } else {
      // Fallback: direct read-modify-write (no lock)
      const data = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
      const modified = modifyFn(data);
      fs.writeFileSync(statusPath, JSON.stringify(modified, null, 2) + '\n');
    }

    return { ok: true, unblocked: resultMeta.unblocked };
  } catch (e) {
    return { ok: false, error: e.message };
  }
}

module.exports = {
  updateStory,
  readStory,
  resolveDependencies,
  getStatusFilePath,
};
