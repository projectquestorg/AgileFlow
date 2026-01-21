/**
 * Tests for story-state-machine.js - Story status transitions
 */

const {
  VALID_STATUSES,
  TRANSITIONS,
  isValidStatus,
  isValidTransition,
  getValidTransitions,
  validateStory,
  transition,
  batchTransition,
  createAuditEntry,
  getAuditTrail,
  clearAuditTrail,
  getWorkflowDoc,
} = require('../../../scripts/lib/story-state-machine');

describe('story-state-machine', () => {
  beforeEach(() => {
    clearAuditTrail();
  });

  describe('VALID_STATUSES', () => {
    it('includes all expected statuses', () => {
      expect(VALID_STATUSES).toContain('ready');
      expect(VALID_STATUSES).toContain('in_progress');
      expect(VALID_STATUSES).toContain('in_review');
      expect(VALID_STATUSES).toContain('blocked');
      expect(VALID_STATUSES).toContain('completed');
      expect(VALID_STATUSES).toContain('archived');
    });

    it('has 6 statuses', () => {
      expect(VALID_STATUSES).toHaveLength(6);
    });
  });

  describe('TRANSITIONS', () => {
    it('allows ready → in_progress', () => {
      expect(TRANSITIONS.ready).toContain('in_progress');
    });

    it('allows ready → blocked', () => {
      expect(TRANSITIONS.ready).toContain('blocked');
    });

    it('allows in_progress → in_review', () => {
      expect(TRANSITIONS.in_progress).toContain('in_review');
    });

    it('allows in_review → completed', () => {
      expect(TRANSITIONS.in_review).toContain('completed');
    });

    it('allows completed → archived', () => {
      expect(TRANSITIONS.completed).toContain('archived');
    });

    it('archived is terminal (no transitions)', () => {
      expect(TRANSITIONS.archived).toHaveLength(0);
    });
  });

  describe('isValidStatus', () => {
    it.each(VALID_STATUSES)('returns true for valid status: %s', status => {
      expect(isValidStatus(status)).toBe(true);
    });

    it('returns false for invalid status', () => {
      expect(isValidStatus('invalid')).toBe(false);
      expect(isValidStatus('pending')).toBe(false);
      expect(isValidStatus('done')).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isValidStatus(null)).toBe(false);
      expect(isValidStatus(undefined)).toBe(false);
    });
  });

  describe('isValidTransition', () => {
    it('returns true for same status (no-op)', () => {
      expect(isValidTransition('ready', 'ready')).toBe(true);
      expect(isValidTransition('completed', 'completed')).toBe(true);
    });

    it('returns true for valid transitions', () => {
      expect(isValidTransition('ready', 'in_progress')).toBe(true);
      expect(isValidTransition('in_progress', 'in_review')).toBe(true);
      expect(isValidTransition('in_review', 'completed')).toBe(true);
    });

    it('returns false for invalid transitions', () => {
      expect(isValidTransition('ready', 'completed')).toBe(false);
      expect(isValidTransition('ready', 'in_review')).toBe(false);
    });

    it('returns false for transitions from archived', () => {
      expect(isValidTransition('archived', 'ready')).toBe(false);
      expect(isValidTransition('archived', 'in_progress')).toBe(false);
    });

    it('returns false for unknown status', () => {
      expect(isValidTransition('unknown', 'ready')).toBe(false);
    });
  });

  describe('getValidTransitions', () => {
    it('returns valid transitions for ready', () => {
      const transitions = getValidTransitions('ready');
      expect(transitions).toContain('in_progress');
      expect(transitions).toContain('blocked');
      expect(transitions).not.toContain('completed');
    });

    it('returns empty array for archived', () => {
      expect(getValidTransitions('archived')).toEqual([]);
    });

    it('returns empty array for unknown status', () => {
      expect(getValidTransitions('unknown')).toEqual([]);
    });
  });

  describe('validateStory', () => {
    it('returns valid for story with id', () => {
      const result = validateStory({ id: 'US-001', status: 'ready' });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns valid for story with storyId', () => {
      const result = validateStory({ storyId: 'US-001', status: 'ready' });
      expect(result.valid).toBe(true);
    });

    it('returns invalid for null story', () => {
      const result = validateStory(null);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Story is null or undefined');
    });

    it('returns invalid for story without id', () => {
      const result = validateStory({ status: 'ready' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('id'))).toBe(true);
    });

    it('returns invalid for story with invalid status', () => {
      const result = validateStory({ id: 'US-001', status: 'invalid' });
      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('Invalid status'))).toBe(true);
    });
  });

  describe('transition', () => {
    it('successfully transitions to valid status', () => {
      const story = { id: 'US-001', status: 'ready' };
      const result = transition(story, 'in_progress');

      expect(result.success).toBe(true);
      expect(result.story.status).toBe('in_progress');
      expect(result.error).toBeNull();
    });

    it('adds transitioned_at timestamp', () => {
      const story = { id: 'US-001', status: 'ready' };
      const result = transition(story, 'in_progress');

      expect(result.story.transitioned_at).toBeDefined();
      expect(new Date(result.story.transitioned_at)).toBeInstanceOf(Date);
    });

    it('adds transitioned_by field', () => {
      const story = { id: 'US-001', status: 'ready' };
      const result = transition(story, 'in_progress', { actor: 'user123' });

      expect(result.story.transitioned_by).toBe('user123');
    });

    it('creates audit entry', () => {
      const story = { id: 'US-001', status: 'ready' };
      const result = transition(story, 'in_progress');

      expect(result.auditEntry).toBeDefined();
      expect(result.auditEntry.story_id).toBe('US-001');
      expect(result.auditEntry.from_status).toBe('ready');
      expect(result.auditEntry.to_status).toBe('in_progress');
    });

    it('fails for invalid target status', () => {
      const story = { id: 'US-001', status: 'ready' };
      const result = transition(story, 'invalid');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid status');
    });

    it('fails for invalid transition', () => {
      const story = { id: 'US-001', status: 'ready' };
      const result = transition(story, 'completed');

      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid transition');
      expect(result.error).toContain('ready → completed');
    });

    it('suggests valid transitions in error', () => {
      const story = { id: 'US-001', status: 'ready' };
      const result = transition(story, 'completed');

      expect(result.error).toContain('in_progress');
      expect(result.error).toContain('blocked');
    });

    it('allows same status (no-op)', () => {
      const story = { id: 'US-001', status: 'ready' };
      const result = transition(story, 'ready');

      expect(result.success).toBe(true);
      expect(result.auditEntry).toBeNull();
    });

    it('allows forced invalid transition', () => {
      const story = { id: 'US-001', status: 'ready' };
      const result = transition(story, 'completed', { force: true });

      expect(result.success).toBe(true);
      expect(result.story.status).toBe('completed');
      expect(result.auditEntry.metadata.forced).toBe(true);
    });

    it('handles invalid story object', () => {
      const result = transition(null, 'ready');
      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid story object');
    });

    it('updates history array if present', () => {
      const story = { id: 'US-001', status: 'ready', history: [] };
      const result = transition(story, 'in_progress');

      expect(result.story.history).toHaveLength(1);
      expect(result.story.history[0].from).toBe('ready');
      expect(result.story.history[0].to).toBe('in_progress');
    });

    it('includes reason in audit entry', () => {
      const story = { id: 'US-001', status: 'ready' };
      const result = transition(story, 'blocked', { reason: 'Waiting for API' });

      expect(result.auditEntry.reason).toBe('Waiting for API');
    });
  });

  describe('batchTransition', () => {
    it('transitions multiple stories', () => {
      const stories = [
        { id: 'US-001', status: 'ready' },
        { id: 'US-002', status: 'ready' },
      ];
      const result = batchTransition(stories, 'in_progress');

      expect(result.success).toBe(true);
      expect(result.results).toHaveLength(2);
      expect(result.errors).toHaveLength(0);
    });

    it('collects errors for invalid transitions', () => {
      const stories = [
        { id: 'US-001', status: 'ready' },
        { id: 'US-002', status: 'archived' }, // Can't transition from archived
      ];
      const result = batchTransition(stories, 'in_progress');

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].story_id).toBe('US-002');
    });
  });

  describe('createAuditEntry', () => {
    it('creates entry with required fields', () => {
      const entry = createAuditEntry('US-001', 'ready', 'in_progress');

      expect(entry.story_id).toBe('US-001');
      expect(entry.from_status).toBe('ready');
      expect(entry.to_status).toBe('in_progress');
      expect(entry.transitioned_at).toBeDefined();
      expect(entry.transitioned_by).toBe('system');
    });

    it('includes actor when provided', () => {
      const entry = createAuditEntry('US-001', 'ready', 'in_progress', { actor: 'user123' });
      expect(entry.transitioned_by).toBe('user123');
    });

    it('includes reason when provided', () => {
      const entry = createAuditEntry('US-001', 'ready', 'blocked', {
        reason: 'Blocked by dependency',
      });
      expect(entry.reason).toBe('Blocked by dependency');
    });
  });

  describe('getAuditTrail', () => {
    it('returns all entries when no filter', () => {
      transition({ id: 'US-001', status: 'ready' }, 'in_progress');
      transition({ id: 'US-002', status: 'ready' }, 'in_progress');

      const trail = getAuditTrail();
      expect(trail).toHaveLength(2);
    });

    it('filters by storyId', () => {
      transition({ id: 'US-001', status: 'ready' }, 'in_progress');
      transition({ id: 'US-002', status: 'ready' }, 'in_progress');

      const trail = getAuditTrail({ storyId: 'US-001' });
      expect(trail).toHaveLength(1);
      expect(trail[0].story_id).toBe('US-001');
    });

    it('filters by fromStatus', () => {
      transition({ id: 'US-001', status: 'ready' }, 'in_progress');
      transition({ id: 'US-001', status: 'in_progress' }, 'in_review');

      const trail = getAuditTrail({ fromStatus: 'in_progress' });
      expect(trail).toHaveLength(1);
      expect(trail[0].from_status).toBe('in_progress');
    });

    it('filters by toStatus', () => {
      transition({ id: 'US-001', status: 'ready' }, 'in_progress');
      transition({ id: 'US-002', status: 'in_review' }, 'completed');

      const trail = getAuditTrail({ toStatus: 'completed' });
      expect(trail).toHaveLength(1);
      expect(trail[0].to_status).toBe('completed');
    });

    it('returns copy of trail', () => {
      transition({ id: 'US-001', status: 'ready' }, 'in_progress');
      const trail1 = getAuditTrail();
      const trail2 = getAuditTrail();
      expect(trail1).not.toBe(trail2);
    });
  });

  describe('clearAuditTrail', () => {
    it('clears all entries', () => {
      transition({ id: 'US-001', status: 'ready' }, 'in_progress');
      expect(getAuditTrail()).toHaveLength(1);

      clearAuditTrail();
      expect(getAuditTrail()).toHaveLength(0);
    });
  });

  describe('getWorkflowDoc', () => {
    it('returns documentation object', () => {
      const doc = getWorkflowDoc();

      expect(doc.statuses).toEqual(VALID_STATUSES);
      expect(doc.transitions).toEqual(TRANSITIONS);
      expect(doc.description).toBeDefined();
    });

    it('has description for each status', () => {
      const doc = getWorkflowDoc();

      VALID_STATUSES.forEach(status => {
        expect(doc.description[status]).toBeDefined();
        expect(typeof doc.description[status]).toBe('string');
      });
    });
  });

  describe('integration: full workflow', () => {
    it('completes happy path workflow', () => {
      let story = { id: 'US-001', status: 'ready', history: [] };

      // ready → in_progress
      let result = transition(story, 'in_progress', { actor: 'dev1' });
      expect(result.success).toBe(true);
      story = result.story;

      // in_progress → in_review
      result = transition(story, 'in_review', { actor: 'dev1' });
      expect(result.success).toBe(true);
      story = result.story;

      // in_review → completed
      result = transition(story, 'completed', { actor: 'reviewer1' });
      expect(result.success).toBe(true);
      story = result.story;

      // completed → archived
      result = transition(story, 'archived', { actor: 'system' });
      expect(result.success).toBe(true);
      story = result.story;

      expect(story.status).toBe('archived');
      expect(story.history).toHaveLength(4);

      // Verify audit trail
      const trail = getAuditTrail({ storyId: 'US-001' });
      expect(trail).toHaveLength(4);
    });

    it('handles blocked flow', () => {
      let story = { id: 'US-001', status: 'in_progress' };

      // in_progress → blocked
      let result = transition(story, 'blocked', { reason: 'Waiting for API' });
      expect(result.success).toBe(true);
      story = result.story;

      // blocked → in_progress
      result = transition(story, 'in_progress', { reason: 'Dependency resolved' });
      expect(result.success).toBe(true);
      story = result.story;

      expect(story.status).toBe('in_progress');
    });

    it('handles reopen flow', () => {
      let story = { id: 'US-001', status: 'completed' };

      // completed → in_progress (reopen)
      const result = transition(story, 'in_progress', { reason: 'Bug found' });
      expect(result.success).toBe(true);
      expect(result.story.status).toBe('in_progress');
    });
  });
});
