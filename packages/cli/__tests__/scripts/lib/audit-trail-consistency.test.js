/**
 * US-0171: Audit trail consistency tests
 *
 * Tests that the audit trail and story.history stay in sync,
 * multiple transitions build consistent history, and batch transitions
 * maintain consistency.
 */

const {
  transition,
  batchTransition,
  getAuditTrail,
  clearAuditTrail,
  createAuditEntry,
} = require('../../../scripts/lib/story-state-machine');

describe('audit-trail-consistency', () => {
  beforeEach(() => {
    clearAuditTrail();
  });

  describe('audit trail and story.history sync', () => {
    it('audit entry matches story history entry', () => {
      const story = { id: 'US-001', status: 'ready', history: [] };
      const result = transition(story, 'in_progress', { actor: 'dev1', reason: 'Starting work' });

      expect(result.success).toBe(true);

      // Check audit entry
      const auditEntry = result.auditEntry;
      expect(auditEntry.story_id).toBe('US-001');
      expect(auditEntry.from_status).toBe('ready');
      expect(auditEntry.to_status).toBe('in_progress');
      expect(auditEntry.transitioned_by).toBe('dev1');
      expect(auditEntry.reason).toBe('Starting work');

      // Check story history
      const historyEntry = result.story.history[0];
      expect(historyEntry.from).toBe('ready');
      expect(historyEntry.to).toBe('in_progress');
      expect(historyEntry.by).toBe('dev1');
      expect(historyEntry.reason).toBe('Starting work');

      // Timestamps should match
      expect(historyEntry.at).toBe(auditEntry.transitioned_at);
    });

    it('no audit entry or history for same-status transition', () => {
      const story = { id: 'US-001', status: 'ready', history: [] };
      const result = transition(story, 'ready');

      expect(result.success).toBe(true);
      expect(result.auditEntry).toBeNull();
      expect(result.story.history).toHaveLength(0);
    });

    it('global audit trail reflects story transitions', () => {
      const story = { id: 'US-001', status: 'ready', history: [] };
      transition(story, 'in_progress', { actor: 'dev1' });

      const trail = getAuditTrail({ storyId: 'US-001' });
      expect(trail).toHaveLength(1);
      expect(trail[0].from_status).toBe('ready');
      expect(trail[0].to_status).toBe('in_progress');
    });

    it('story without history array still creates audit entry', () => {
      const story = { id: 'US-001', status: 'ready' }; // No history array
      const result = transition(story, 'in_progress');

      expect(result.success).toBe(true);
      expect(result.auditEntry).not.toBeNull();

      // Audit trail should have the entry
      const trail = getAuditTrail({ storyId: 'US-001' });
      expect(trail).toHaveLength(1);

      // Story should NOT have history (it wasn't provided)
      expect(result.story.history).toBeUndefined();
    });
  });

  describe('multiple transitions build consistent history', () => {
    it('tracks complete workflow in history', () => {
      let story = { id: 'US-001', status: 'ready', history: [] };

      // ready → in_progress
      let result = transition(story, 'in_progress', { actor: 'dev1' });
      story = result.story;

      // in_progress → in_review
      result = transition(story, 'in_review', { actor: 'dev1' });
      story = result.story;

      // in_review → completed
      result = transition(story, 'completed', { actor: 'reviewer' });
      story = result.story;

      // Verify history length
      expect(story.history).toHaveLength(3);

      // Verify history order (chronological)
      expect(story.history[0].from).toBe('ready');
      expect(story.history[0].to).toBe('in_progress');

      expect(story.history[1].from).toBe('in_progress');
      expect(story.history[1].to).toBe('in_review');

      expect(story.history[2].from).toBe('in_review');
      expect(story.history[2].to).toBe('completed');

      // Verify audit trail matches
      const trail = getAuditTrail({ storyId: 'US-001' });
      expect(trail).toHaveLength(3);

      // Verify order consistency
      for (let i = 0; i < story.history.length; i++) {
        expect(story.history[i].from).toBe(trail[i].from_status);
        expect(story.history[i].to).toBe(trail[i].to_status);
      }
    });

    it('tracks blocked/unblocked cycle', () => {
      let story = { id: 'US-001', status: 'in_progress', history: [] };

      // Block the story
      let result = transition(story, 'blocked', { reason: 'Waiting for API' });
      story = result.story;

      // Unblock
      result = transition(story, 'in_progress', { reason: 'API ready' });
      story = result.story;

      expect(story.history).toHaveLength(2);
      expect(story.history[0].reason).toBe('Waiting for API');
      expect(story.history[1].reason).toBe('API ready');
    });

    it('tracks reopen cycle', () => {
      let story = { id: 'US-001', status: 'completed', history: [] };

      // Reopen
      let result = transition(story, 'in_progress', { reason: 'Bug found' });
      story = result.story;

      // Complete again
      result = transition(story, 'in_review');
      story = result.story;

      result = transition(story, 'completed', { reason: 'Bug fixed' });
      story = result.story;

      expect(story.history).toHaveLength(3);
      expect(story.history[0].from).toBe('completed');
      expect(story.history[0].to).toBe('in_progress');
      expect(story.history[0].reason).toBe('Bug found');
    });

    it('timestamps are sequential', () => {
      let story = { id: 'US-001', status: 'ready', history: [] };

      const result1 = transition(story, 'in_progress');
      story = result1.story;

      // Small delay to ensure different timestamps
      const result2 = transition(story, 'in_review');
      story = result2.story;

      const time1 = new Date(story.history[0].at).getTime();
      const time2 = new Date(story.history[1].at).getTime();

      expect(time2).toBeGreaterThanOrEqual(time1);
    });

    it('failed transitions do not appear in history', () => {
      const story = { id: 'US-001', status: 'ready', history: [] };

      // Try invalid transition
      const result = transition(story, 'completed'); // Invalid: ready → completed

      expect(result.success).toBe(false);
      expect(result.story.history).toHaveLength(0); // No entry added

      // Audit trail should also be empty for failed transitions
      expect(getAuditTrail({ storyId: 'US-001' })).toHaveLength(0);
    });

    it('forced transitions are marked in history', () => {
      const story = { id: 'US-001', status: 'ready', history: [] };

      // Force invalid transition
      const result = transition(story, 'completed', { force: true });

      expect(result.success).toBe(true);
      expect(result.auditEntry.metadata.forced).toBe(true);

      // History should reflect the forced transition
      expect(result.story.history).toHaveLength(1);
      expect(result.story.history[0].from).toBe('ready');
      expect(result.story.history[0].to).toBe('completed');
    });
  });

  describe('batch transitions consistency', () => {
    it('batch creates audit entries for each story', () => {
      const stories = [
        { id: 'US-001', status: 'ready', history: [] },
        { id: 'US-002', status: 'ready', history: [] },
        { id: 'US-003', status: 'ready', history: [] },
      ];

      const result = batchTransition(stories, 'in_progress', { actor: 'dev1' });

      expect(result.success).toBe(true);

      // Each story should have audit entry
      const trail = getAuditTrail();
      expect(trail).toHaveLength(3);

      // Verify each story's audit entry
      const storyIds = trail.map(e => e.story_id);
      expect(storyIds).toContain('US-001');
      expect(storyIds).toContain('US-002');
      expect(storyIds).toContain('US-003');

      // All should have same actor
      trail.forEach(e => {
        expect(e.transitioned_by).toBe('dev1');
        expect(e.from_status).toBe('ready');
        expect(e.to_status).toBe('in_progress');
      });
    });

    it('batch updates history for each story', () => {
      const stories = [
        { id: 'US-001', status: 'ready', history: [] },
        { id: 'US-002', status: 'ready', history: [] },
      ];

      const result = batchTransition(stories, 'in_progress');

      result.results.forEach(r => {
        expect(r.story.history).toHaveLength(1);
        expect(r.story.history[0].from).toBe('ready');
        expect(r.story.history[0].to).toBe('in_progress');
      });
    });

    it('partial batch failure maintains consistency', () => {
      const stories = [
        { id: 'US-001', status: 'ready', history: [] },
        { id: 'US-002', status: 'archived', history: [] }, // Will fail (archived is terminal)
        { id: 'US-003', status: 'ready', history: [] },
      ];

      const result = batchTransition(stories, 'in_progress');

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].story_id).toBe('US-002');

      // Audit trail should only have successful transitions
      const trail = getAuditTrail();
      expect(trail).toHaveLength(2); // US-001 and US-003

      const auditStoryIds = trail.map(e => e.story_id);
      expect(auditStoryIds).toContain('US-001');
      expect(auditStoryIds).toContain('US-003');
      expect(auditStoryIds).not.toContain('US-002');
    });

    it('batch with all failures creates no audit entries', () => {
      const stories = [
        { id: 'US-001', status: 'archived', history: [] },
        { id: 'US-002', status: 'archived', history: [] },
      ];

      const result = batchTransition(stories, 'in_progress');

      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(2);
      expect(getAuditTrail()).toHaveLength(0);
    });

    it('batch preserves individual story metadata', () => {
      const stories = [
        { id: 'US-001', status: 'ready', history: [], epic: 'EP-001' },
        { id: 'US-002', status: 'ready', history: [], epic: 'EP-002', priority: 'P1' },
      ];

      const result = batchTransition(stories, 'in_progress');

      expect(result.results[0].story.epic).toBe('EP-001');
      expect(result.results[1].story.epic).toBe('EP-002');
      expect(result.results[1].story.priority).toBe('P1');
    });
  });

  describe('audit trail filtering consistency', () => {
    it('filters by story ID correctly', () => {
      transition({ id: 'US-001', status: 'ready' }, 'in_progress');
      transition({ id: 'US-002', status: 'ready' }, 'in_progress');
      transition({ id: 'US-001', status: 'in_progress' }, 'in_review');

      const trail = getAuditTrail({ storyId: 'US-001' });
      expect(trail).toHaveLength(2);
      trail.forEach(e => expect(e.story_id).toBe('US-001'));
    });

    it('filters by from_status correctly', () => {
      transition({ id: 'US-001', status: 'ready' }, 'in_progress');
      transition({ id: 'US-002', status: 'in_progress' }, 'in_review');

      const trail = getAuditTrail({ fromStatus: 'in_progress' });
      expect(trail).toHaveLength(1);
      expect(trail[0].story_id).toBe('US-002');
    });

    it('filters by to_status correctly', () => {
      transition({ id: 'US-001', status: 'ready' }, 'in_progress');
      transition({ id: 'US-002', status: 'ready' }, 'blocked');
      transition({ id: 'US-003', status: 'in_progress' }, 'in_review');

      const trail = getAuditTrail({ toStatus: 'in_progress' });
      expect(trail).toHaveLength(1);
      expect(trail[0].story_id).toBe('US-001');
    });

    it('combined filters work correctly', () => {
      transition({ id: 'US-001', status: 'ready' }, 'in_progress');
      transition({ id: 'US-001', status: 'in_progress' }, 'in_review');
      transition({ id: 'US-002', status: 'ready' }, 'in_progress');

      const trail = getAuditTrail({
        storyId: 'US-001',
        fromStatus: 'ready',
      });

      expect(trail).toHaveLength(1);
      expect(trail[0].from_status).toBe('ready');
      expect(trail[0].to_status).toBe('in_progress');
    });
  });

  describe('audit entry structure', () => {
    it('createAuditEntry produces valid structure', () => {
      const entry = createAuditEntry('US-001', 'ready', 'in_progress', {
        actor: 'dev1',
        reason: 'Starting sprint',
        extra: { sprint: 'S1' },
      });

      expect(entry.story_id).toBe('US-001');
      expect(entry.from_status).toBe('ready');
      expect(entry.to_status).toBe('in_progress');
      expect(entry.transitioned_by).toBe('dev1');
      expect(entry.reason).toBe('Starting sprint');
      expect(entry.metadata).toEqual({ sprint: 'S1' });
      expect(entry.transitioned_at).toMatch(/^\d{4}-\d{2}-\d{2}T/); // ISO format
    });

    it('audit entry has valid ISO timestamp', () => {
      const story = { id: 'US-001', status: 'ready' };
      const result = transition(story, 'in_progress');

      const timestamp = result.auditEntry.transitioned_at;
      const date = new Date(timestamp);

      expect(date.toISOString()).toBe(timestamp);
      expect(date.getTime()).not.toBeNaN();
    });

    it('default actor is system', () => {
      const entry = createAuditEntry('US-001', 'ready', 'in_progress');
      expect(entry.transitioned_by).toBe('system');
    });

    it('reason defaults to null', () => {
      const entry = createAuditEntry('US-001', 'ready', 'in_progress');
      expect(entry.reason).toBeNull();
    });
  });

  describe('clearAuditTrail consistency', () => {
    it('clears all entries completely', () => {
      transition({ id: 'US-001', status: 'ready' }, 'in_progress');
      transition({ id: 'US-002', status: 'ready' }, 'in_progress');

      expect(getAuditTrail()).toHaveLength(2);

      clearAuditTrail();

      expect(getAuditTrail()).toHaveLength(0);
    });

    it('new entries work after clear', () => {
      transition({ id: 'US-001', status: 'ready' }, 'in_progress');
      clearAuditTrail();
      transition({ id: 'US-002', status: 'ready' }, 'in_progress');

      const trail = getAuditTrail();
      expect(trail).toHaveLength(1);
      expect(trail[0].story_id).toBe('US-002');
    });
  });

  describe('multiple stories same timeline', () => {
    it('interleaved transitions maintain separate histories', () => {
      let story1 = { id: 'US-001', status: 'ready', history: [] };
      let story2 = { id: 'US-002', status: 'ready', history: [] };

      // Interleaved transitions
      let result = transition(story1, 'in_progress');
      story1 = result.story;

      result = transition(story2, 'in_progress');
      story2 = result.story;

      result = transition(story1, 'in_review');
      story1 = result.story;

      result = transition(story2, 'blocked');
      story2 = result.story;

      // Each story has its own history
      expect(story1.history).toHaveLength(2);
      expect(story1.history[1].to).toBe('in_review');

      expect(story2.history).toHaveLength(2);
      expect(story2.history[1].to).toBe('blocked');

      // Global audit trail has all entries
      expect(getAuditTrail()).toHaveLength(4);

      // Filter still works
      expect(getAuditTrail({ storyId: 'US-001' })).toHaveLength(2);
      expect(getAuditTrail({ storyId: 'US-002' })).toHaveLength(2);
    });
  });
});
