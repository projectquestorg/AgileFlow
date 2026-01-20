/**
 * AgileFlow CLI - Story State Machine
 *
 * Enforces valid status transitions for user stories and maintains an audit trail.
 * Prevents invalid state changes and provides clear error messages.
 *
 * Valid Status Values:
 * - ready: Story is defined and ready to be worked on
 * - in_progress: Story is actively being worked on
 * - in_review: Story implementation complete, awaiting review
 * - blocked: Story cannot proceed due to external dependency
 * - completed: Story is done and verified
 * - archived: Story has been archived (historical)
 *
 * Valid Transitions:
 * - ready → in_progress, blocked
 * - in_progress → in_review, blocked, ready
 * - in_review → completed, in_progress, blocked
 * - blocked → ready, in_progress, in_review
 * - completed → archived, in_progress (reopened)
 * - archived → (terminal - no transitions out)
 */

// Valid story statuses
const VALID_STATUSES = ['ready', 'in_progress', 'in_review', 'blocked', 'completed', 'archived'];

// Define valid state transitions
// Key = from state, Value = array of valid "to" states
const TRANSITIONS = {
  ready: ['in_progress', 'blocked'],
  in_progress: ['in_review', 'blocked', 'ready'],
  in_review: ['completed', 'in_progress', 'blocked'],
  blocked: ['ready', 'in_progress', 'in_review'],
  completed: ['archived', 'in_progress'],
  archived: [], // Terminal state
};

// Audit trail storage
let auditTrail = [];

/**
 * Check if a status is valid
 * @param {string} status - Status to check
 * @returns {boolean} True if valid
 */
function isValidStatus(status) {
  return VALID_STATUSES.includes(status);
}

/**
 * Check if a transition is valid
 * @param {string} fromStatus - Current status
 * @param {string} toStatus - Target status
 * @returns {boolean} True if transition is valid
 */
function isValidTransition(fromStatus, toStatus) {
  // Same status is always valid (no-op)
  if (fromStatus === toStatus) {
    return true;
  }

  // Check if fromStatus has defined transitions
  if (!TRANSITIONS[fromStatus]) {
    return false;
  }

  // Check if toStatus is in the valid transitions list
  return TRANSITIONS[fromStatus].includes(toStatus);
}

/**
 * Get valid transitions from a status
 * @param {string} fromStatus - Current status
 * @returns {Array<string>} Array of valid target statuses
 */
function getValidTransitions(fromStatus) {
  return TRANSITIONS[fromStatus] || [];
}

/**
 * Create an audit entry
 * @param {string} storyId - Story identifier
 * @param {string} fromStatus - Previous status
 * @param {string} toStatus - New status
 * @param {Object} [metadata] - Additional metadata
 * @returns {Object} Audit entry
 */
function createAuditEntry(storyId, fromStatus, toStatus, metadata = {}) {
  return {
    storyId,
    fromStatus,
    toStatus,
    transitionedAt: new Date().toISOString(),
    transitionedBy: metadata.actor || 'system',
    reason: metadata.reason || null,
    metadata: metadata.extra || {},
  };
}

/**
 * Log transition to audit trail
 * @param {Object} entry - Audit entry
 */
function logAuditEntry(entry) {
  auditTrail.push(entry);
}

/**
 * Get audit trail
 * @param {Object} [filter] - Optional filter
 * @param {string} [filter.storyId] - Filter by story ID
 * @param {string} [filter.fromStatus] - Filter by from status
 * @param {string} [filter.toStatus] - Filter by to status
 * @returns {Array} Filtered audit entries
 */
function getAuditTrail(filter = {}) {
  let entries = [...auditTrail];

  if (filter.storyId) {
    entries = entries.filter(e => e.storyId === filter.storyId);
  }
  if (filter.fromStatus) {
    entries = entries.filter(e => e.fromStatus === filter.fromStatus);
  }
  if (filter.toStatus) {
    entries = entries.filter(e => e.toStatus === filter.toStatus);
  }

  return entries;
}

/**
 * Clear audit trail (for testing)
 */
function clearAuditTrail() {
  auditTrail = [];
}

/**
 * Transition a story to a new status
 * @param {Object} story - Story object with at least { id, status }
 * @param {string} toStatus - Target status
 * @param {Object} [options] - Transition options
 * @param {string} [options.actor] - Who is making the transition
 * @param {string} [options.reason] - Reason for transition
 * @param {boolean} [options.force=false] - Force transition even if invalid
 * @returns {{ success: boolean, story: Object, error: string | null, auditEntry: Object | null }}
 */
function transition(story, toStatus, options = {}) {
  const { actor = 'system', reason = null, force = false } = options;

  // Validate inputs
  if (!story || typeof story !== 'object') {
    return {
      success: false,
      story: null,
      error: 'Invalid story object',
      auditEntry: null,
    };
  }

  const storyId = story.id || story.storyId || 'unknown';
  const fromStatus = story.status || 'ready';

  // Validate target status
  if (!isValidStatus(toStatus)) {
    return {
      success: false,
      story,
      error: `Invalid status: "${toStatus}". Valid statuses are: ${VALID_STATUSES.join(', ')}`,
      auditEntry: null,
    };
  }

  // Check transition validity
  if (!force && !isValidTransition(fromStatus, toStatus)) {
    const validTargets = getValidTransitions(fromStatus);
    return {
      success: false,
      story,
      error: `Invalid transition: ${fromStatus} → ${toStatus}. Valid transitions from "${fromStatus}" are: ${validTargets.join(', ') || 'none'}`,
      auditEntry: null,
    };
  }

  // Same status is a no-op
  if (fromStatus === toStatus) {
    return {
      success: true,
      story,
      error: null,
      auditEntry: null,
    };
  }

  // Create audit entry
  const auditEntry = createAuditEntry(storyId, fromStatus, toStatus, {
    actor,
    reason,
    extra: { forced: force && !isValidTransition(fromStatus, toStatus) },
  });

  // Log to audit trail
  logAuditEntry(auditEntry);

  // Update story
  const updatedStory = {
    ...story,
    status: toStatus,
    transitioned_at: auditEntry.transitionedAt,
    transitioned_by: auditEntry.transitionedBy,
  };

  // Add history entry if story has history array
  if (Array.isArray(story.history)) {
    updatedStory.history = [
      ...story.history,
      {
        from: fromStatus,
        to: toStatus,
        at: auditEntry.transitionedAt,
        by: auditEntry.transitionedBy,
        reason,
      },
    ];
  }

  return {
    success: true,
    story: updatedStory,
    error: null,
    auditEntry,
  };
}

/**
 * Batch transition multiple stories
 * @param {Array<Object>} stories - Array of story objects
 * @param {string} toStatus - Target status
 * @param {Object} [options] - Transition options
 * @returns {{ success: boolean, results: Array, errors: Array }}
 */
function batchTransition(stories, toStatus, options = {}) {
  const results = [];
  const errors = [];

  for (const story of stories) {
    const result = transition(story, toStatus, options);
    results.push(result);
    if (!result.success) {
      errors.push({ storyId: story.id || 'unknown', error: result.error });
    }
  }

  return {
    success: errors.length === 0,
    results,
    errors,
  };
}

/**
 * Get status workflow documentation
 * @returns {Object} Workflow documentation
 */
function getWorkflowDoc() {
  return {
    statuses: VALID_STATUSES,
    transitions: TRANSITIONS,
    description: {
      ready: 'Story is defined and ready to be worked on',
      in_progress: 'Story is actively being worked on',
      in_review: 'Story implementation complete, awaiting review',
      blocked: 'Story cannot proceed due to external dependency',
      completed: 'Story is done and verified',
      archived: 'Story has been archived (historical)',
    },
  };
}

/**
 * Validate a story object has required fields
 * @param {Object} story - Story to validate
 * @returns {{ valid: boolean, errors: Array<string> }}
 */
function validateStory(story) {
  const errors = [];

  if (!story) {
    errors.push('Story is null or undefined');
    return { valid: false, errors };
  }

  if (!story.id && !story.storyId) {
    errors.push('Story must have an id or storyId field');
  }

  if (story.status && !isValidStatus(story.status)) {
    errors.push(`Invalid status: ${story.status}`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Check if all stories in an epic are complete
 * @param {Object} statusData - Full status.json data
 * @param {string} epicId - Epic ID to check
 * @returns {{ allComplete: boolean, total: number, completed: number, remaining: Array }}
 */
function checkEpicCompletion(statusData, epicId) {
  const epic = statusData.epics?.[epicId];
  if (!epic) {
    return { allComplete: false, total: 0, completed: 0, remaining: [] };
  }

  const storyIds = epic.stories || [];
  const completedStatuses = ['completed', 'done', 'archived'];
  const completed = [];
  const remaining = [];

  for (const storyId of storyIds) {
    const story = statusData.stories?.[storyId];
    if (story && completedStatuses.includes(story.status)) {
      completed.push(storyId);
    } else {
      remaining.push(storyId);
    }
  }

  return {
    allComplete: remaining.length === 0 && storyIds.length > 0,
    total: storyIds.length,
    completed: completed.length,
    remaining,
  };
}

/**
 * Auto-complete an epic if all its stories are done
 * @param {Object} statusData - Full status.json data (will be mutated)
 * @param {string} epicId - Epic ID to check and potentially complete
 * @returns {{ updated: boolean, epic: Object | null, message: string }}
 */
function autoCompleteEpic(statusData, epicId) {
  const epic = statusData.epics?.[epicId];
  if (!epic) {
    return { updated: false, epic: null, message: `Epic ${epicId} not found` };
  }

  // Already complete
  if (epic.status === 'complete' || epic.status === 'completed') {
    return { updated: false, epic, message: `Epic ${epicId} already complete` };
  }

  const { allComplete, total, completed } = checkEpicCompletion(statusData, epicId);

  if (allComplete) {
    epic.status = 'complete';
    epic.completed = new Date().toISOString().split('T')[0];
    statusData.updated = new Date().toISOString();
    return {
      updated: true,
      epic,
      message: `Epic ${epicId} auto-completed (${completed}/${total} stories done)`,
    };
  }

  return {
    updated: false,
    epic,
    message: `Epic ${epicId} not complete yet (${completed}/${total} stories done)`,
  };
}

/**
 * Find epics that should be marked complete but aren't
 * @param {Object} statusData - Full status.json data
 * @returns {Array<{ epicId: string, completed: number, total: number }>}
 */
function findIncompleteEpics(statusData) {
  const incompleteEpics = [];

  for (const [epicId, epic] of Object.entries(statusData.epics || {})) {
    if (epic.status === 'complete' || epic.status === 'completed') {
      continue;
    }

    const { allComplete, total, completed } = checkEpicCompletion(statusData, epicId);
    if (allComplete) {
      incompleteEpics.push({ epicId, completed, total });
    }
  }

  return incompleteEpics;
}

module.exports = {
  // Constants
  VALID_STATUSES,
  TRANSITIONS,

  // Validation
  isValidStatus,
  isValidTransition,
  getValidTransitions,
  validateStory,

  // Transitions
  transition,
  batchTransition,

  // Audit trail
  createAuditEntry,
  logAuditEntry,
  getAuditTrail,
  clearAuditTrail,

  // Documentation
  getWorkflowDoc,

  // Epic completion
  checkEpicCompletion,
  autoCompleteEpic,
  findIncompleteEpics,
};
