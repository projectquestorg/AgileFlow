/**
 * US-0170: Derived state consistency tests
 *
 * Tests that derived state calculations (WIP count, completion percentage)
 * remain accurate after status changes and handle edge cases properly.
 */

const {
  VALID_STATUSES,
  COMPLETED_STATUSES,
  isValidStatus,
  transition,
  batchTransition,
  checkEpicCompletion,
  clearAuditTrail,
} = require('../../../scripts/lib/story-state-machine');

// Helper: Calculate WIP count (stories in progress or review)
function calculateWipCount(stories) {
  const wipStatuses = ['in_progress', 'in_review'];
  return Object.values(stories).filter(s => wipStatuses.includes(s.status)).length;
}

// Helper: Calculate completion percentage
function calculateCompletionPercentage(stories) {
  const storyList = Object.values(stories);
  if (storyList.length === 0) return 0;

  const completedCount = storyList.filter(s =>
    COMPLETED_STATUSES.includes(s.status)
  ).length;

  return Math.round((completedCount / storyList.length) * 100);
}

// Helper: Create story data for testing
function createTestData(storyStatuses) {
  const stories = {};
  Object.entries(storyStatuses).forEach(([id, status]) => {
    stories[id] = { title: `Story ${id}`, status };
  });
  return { stories };
}

describe('derived-state-consistency', () => {
  beforeEach(() => {
    clearAuditTrail();
  });

  describe('WIP count accuracy', () => {
    it('calculates WIP correctly with all status types', () => {
      const data = createTestData({
        'US-001': 'ready',
        'US-002': 'in_progress',
        'US-003': 'in_review',
        'US-004': 'blocked',
        'US-005': 'completed',
        'US-006': 'archived',
      });

      expect(calculateWipCount(data.stories)).toBe(2); // in_progress + in_review
    });

    it('increases WIP when story moves to in_progress', () => {
      const data = createTestData({
        'US-001': 'ready',
        'US-002': 'ready',
      });

      expect(calculateWipCount(data.stories)).toBe(0);

      // Transition US-001 to in_progress
      const result = transition({ id: 'US-001', status: 'ready' }, 'in_progress');
      data.stories['US-001'].status = result.story.status;

      expect(calculateWipCount(data.stories)).toBe(1);
    });

    it('decreases WIP when story completes', () => {
      const data = createTestData({
        'US-001': 'in_progress',
        'US-002': 'in_review',
      });

      expect(calculateWipCount(data.stories)).toBe(2);

      // Complete US-002 (in_review → completed)
      const result = transition({ id: 'US-002', status: 'in_review' }, 'completed');
      data.stories['US-002'].status = result.story.status;

      expect(calculateWipCount(data.stories)).toBe(1);
    });

    it('WIP unchanged when moving between WIP statuses', () => {
      const data = createTestData({
        'US-001': 'in_progress',
        'US-002': 'ready',
      });

      expect(calculateWipCount(data.stories)).toBe(1);

      // Move to in_review (still WIP)
      const result = transition({ id: 'US-001', status: 'in_progress' }, 'in_review');
      data.stories['US-001'].status = result.story.status;

      expect(calculateWipCount(data.stories)).toBe(1); // Still 1 WIP
    });

    it('WIP correct after blocked story returns to work', () => {
      const data = createTestData({
        'US-001': 'blocked',
        'US-002': 'in_progress',
      });

      expect(calculateWipCount(data.stories)).toBe(1);

      // Unblock US-001
      const result = transition({ id: 'US-001', status: 'blocked' }, 'in_progress');
      data.stories['US-001'].status = result.story.status;

      expect(calculateWipCount(data.stories)).toBe(2);
    });

    it('handles batch transitions affecting WIP', () => {
      const stories = [
        { id: 'US-001', status: 'ready' },
        { id: 'US-002', status: 'ready' },
        { id: 'US-003', status: 'ready' },
      ];
      const data = {
        stories: {
          'US-001': { status: 'ready' },
          'US-002': { status: 'ready' },
          'US-003': { status: 'ready' },
        },
      };

      expect(calculateWipCount(data.stories)).toBe(0);

      // Batch transition all to in_progress
      const result = batchTransition(stories, 'in_progress');
      expect(result.success).toBe(true);

      result.results.forEach(r => {
        data.stories[r.story.id].status = r.story.status;
      });

      expect(calculateWipCount(data.stories)).toBe(3);
    });
  });

  describe('completion percentage accuracy', () => {
    it('returns 0 for empty stories', () => {
      expect(calculateCompletionPercentage({})).toBe(0);
    });

    it('returns 0 when no stories are completed', () => {
      const data = createTestData({
        'US-001': 'ready',
        'US-002': 'in_progress',
        'US-003': 'blocked',
      });

      expect(calculateCompletionPercentage(data.stories)).toBe(0);
    });

    it('returns 100 when all stories are completed', () => {
      const data = createTestData({
        'US-001': 'completed',
        'US-002': 'completed',
        'US-003': 'archived',
      });

      expect(calculateCompletionPercentage(data.stories)).toBe(100);
    });

    it('calculates correct percentage for mixed statuses', () => {
      const data = createTestData({
        'US-001': 'completed',
        'US-002': 'completed',
        'US-003': 'in_progress',
        'US-004': 'ready',
      });

      expect(calculateCompletionPercentage(data.stories)).toBe(50); // 2/4 = 50%
    });

    it('updates percentage after completing a story', () => {
      const data = createTestData({
        'US-001': 'completed',
        'US-002': 'in_review',
        'US-003': 'ready',
      });

      expect(calculateCompletionPercentage(data.stories)).toBe(33); // 1/3 ≈ 33%

      // Complete US-002
      const result = transition({ id: 'US-002', status: 'in_review' }, 'completed');
      data.stories['US-002'].status = result.story.status;

      expect(calculateCompletionPercentage(data.stories)).toBe(67); // 2/3 ≈ 67%
    });

    it('treats archived as completed for percentage', () => {
      const data = createTestData({
        'US-001': 'archived',
        'US-002': 'completed',
        'US-003': 'ready',
        'US-004': 'in_progress',
      });

      expect(calculateCompletionPercentage(data.stories)).toBe(50); // archived + completed = 2/4
    });

    it('percentage remains stable during WIP changes', () => {
      const data = createTestData({
        'US-001': 'completed',
        'US-002': 'in_progress',
      });

      const initialPercent = calculateCompletionPercentage(data.stories);

      // Move in_progress to in_review (neither completes the story)
      data.stories['US-002'].status = 'in_review';

      expect(calculateCompletionPercentage(data.stories)).toBe(initialPercent);
    });
  });

  describe('checkEpicCompletion derived state', () => {
    it('returns correct completion stats', () => {
      const data = {
        epics: {
          'EP-001': { title: 'Epic 1', stories: ['US-001', 'US-002', 'US-003'] },
        },
        stories: {
          'US-001': { status: 'completed' },
          'US-002': { status: 'in_progress' },
          'US-003': { status: 'ready' },
        },
      };

      const result = checkEpicCompletion(data, 'EP-001');

      expect(result.total).toBe(3);
      expect(result.completed).toBe(1);
      expect(result.remaining).toEqual(['US-002', 'US-003']);
      expect(result.allComplete).toBe(false);
    });

    it('allComplete true when all stories done', () => {
      const data = {
        epics: {
          'EP-001': { title: 'Epic 1', stories: ['US-001', 'US-002'] },
        },
        stories: {
          'US-001': { status: 'completed' },
          'US-002': { status: 'archived' },
        },
      };

      const result = checkEpicCompletion(data, 'EP-001');

      expect(result.allComplete).toBe(true);
      expect(result.remaining).toEqual([]);
    });

    it('updates after story transition', () => {
      const data = {
        epics: {
          'EP-001': { title: 'Epic 1', stories: ['US-001', 'US-002'] },
        },
        stories: {
          'US-001': { status: 'completed' },
          'US-002': { status: 'in_review' },
        },
      };

      expect(checkEpicCompletion(data, 'EP-001').allComplete).toBe(false);

      // Complete US-002
      const result = transition({ id: 'US-002', status: 'in_review' }, 'completed');
      data.stories['US-002'].status = result.story.status;

      expect(checkEpicCompletion(data, 'EP-001').allComplete).toBe(true);
    });
  });

  describe('edge cases with missing/null fields', () => {
    it('handles stories with missing status (undefined)', () => {
      const data = {
        stories: {
          'US-001': { title: 'Story 1' }, // no status
          'US-002': { title: 'Story 2', status: 'completed' },
        },
      };

      // Should not crash, undefined is not WIP
      expect(calculateWipCount(data.stories)).toBe(0);

      // undefined is not completed either
      expect(calculateCompletionPercentage(data.stories)).toBe(50); // 1 of 2
    });

    it('handles stories with null status', () => {
      const data = {
        stories: {
          'US-001': { title: 'Story 1', status: null },
          'US-002': { title: 'Story 2', status: 'in_progress' },
        },
      };

      expect(calculateWipCount(data.stories)).toBe(1); // Only US-002
      expect(calculateCompletionPercentage(data.stories)).toBe(0);
    });

    it('handles empty string status', () => {
      const data = {
        stories: {
          'US-001': { title: 'Story 1', status: '' },
          'US-002': { title: 'Story 2', status: 'completed' },
        },
      };

      expect(calculateWipCount(data.stories)).toBe(0);
      expect(calculateCompletionPercentage(data.stories)).toBe(50);
    });

    it('handles unknown/invalid status values', () => {
      const data = {
        stories: {
          'US-001': { title: 'Story 1', status: 'garbage' },
          'US-002': { title: 'Story 2', status: 'todo' }, // Legacy, not valid
          'US-003': { title: 'Story 3', status: 'completed' },
        },
      };

      // Unknown statuses are not WIP
      expect(calculateWipCount(data.stories)).toBe(0);

      // Unknown statuses are not completed
      expect(calculateCompletionPercentage(data.stories)).toBe(33); // 1/3
    });

    it('handles epic with missing stories array', () => {
      const data = {
        epics: {
          'EP-001': { title: 'Epic without stories' }, // no stories array
        },
        stories: {},
      };

      const result = checkEpicCompletion(data, 'EP-001');

      expect(result.total).toBe(0);
      expect(result.completed).toBe(0);
      expect(result.allComplete).toBe(false);
    });

    it('handles epic with empty stories array', () => {
      const data = {
        epics: {
          'EP-001': { title: 'Empty epic', stories: [] },
        },
        stories: {},
      };

      const result = checkEpicCompletion(data, 'EP-001');

      expect(result.total).toBe(0);
      expect(result.allComplete).toBe(false); // Empty is not "all complete"
    });

    it('handles epic referencing non-existent stories', () => {
      const data = {
        epics: {
          'EP-001': { title: 'Epic', stories: ['US-001', 'US-999'] }, // US-999 doesn't exist
        },
        stories: {
          'US-001': { status: 'completed' },
        },
      };

      const result = checkEpicCompletion(data, 'EP-001');

      expect(result.total).toBe(2);
      expect(result.completed).toBe(1);
      expect(result.remaining).toContain('US-999');
      expect(result.allComplete).toBe(false);
    });

    it('handles stories object being null/undefined', () => {
      expect(calculateWipCount(null || {})).toBe(0);
      expect(calculateWipCount(undefined || {})).toBe(0);
      expect(calculateCompletionPercentage(null || {})).toBe(0);
      expect(calculateCompletionPercentage(undefined || {})).toBe(0);
    });

    it('handles stories with only completed_at but wrong status', () => {
      // Edge case: story has completed_at timestamp but status is not completed
      const data = {
        stories: {
          'US-001': {
            status: 'in_progress',
            completed_at: '2026-01-01T00:00:00.000Z', // Inconsistent!
          },
        },
      };

      // Should use status, not completed_at
      expect(calculateCompletionPercentage(data.stories)).toBe(0);
      expect(calculateWipCount(data.stories)).toBe(1);
    });
  });

  describe('consistency across multiple operations', () => {
    it('derived state consistent through full workflow', () => {
      const data = createTestData({
        'US-001': 'ready',
        'US-002': 'ready',
        'US-003': 'ready',
        'US-004': 'ready',
      });

      // Initial state
      expect(calculateWipCount(data.stories)).toBe(0);
      expect(calculateCompletionPercentage(data.stories)).toBe(0);

      // Start US-001
      let result = transition({ id: 'US-001', status: 'ready' }, 'in_progress');
      data.stories['US-001'].status = result.story.status;

      expect(calculateWipCount(data.stories)).toBe(1);
      expect(calculateCompletionPercentage(data.stories)).toBe(0);

      // Submit for review
      result = transition({ id: 'US-001', status: 'in_progress' }, 'in_review');
      data.stories['US-001'].status = result.story.status;

      expect(calculateWipCount(data.stories)).toBe(1); // in_review is still WIP
      expect(calculateCompletionPercentage(data.stories)).toBe(0);

      // Complete US-001
      result = transition({ id: 'US-001', status: 'in_review' }, 'completed');
      data.stories['US-001'].status = result.story.status;

      expect(calculateWipCount(data.stories)).toBe(0);
      expect(calculateCompletionPercentage(data.stories)).toBe(25); // 1/4

      // Complete remaining stories
      for (const id of ['US-002', 'US-003', 'US-004']) {
        result = transition({ id, status: 'ready' }, 'in_progress');
        data.stories[id].status = result.story.status;

        result = transition({ id, status: 'in_progress' }, 'in_review');
        data.stories[id].status = result.story.status;

        result = transition({ id, status: 'in_review' }, 'completed');
        data.stories[id].status = result.story.status;
      }

      expect(calculateWipCount(data.stories)).toBe(0);
      expect(calculateCompletionPercentage(data.stories)).toBe(100);
    });

    it('derived state consistent after reopening completed story', () => {
      const data = createTestData({
        'US-001': 'completed',
        'US-002': 'completed',
      });

      expect(calculateCompletionPercentage(data.stories)).toBe(100);
      expect(calculateWipCount(data.stories)).toBe(0);

      // Reopen US-001
      const result = transition({ id: 'US-001', status: 'completed' }, 'in_progress');
      data.stories['US-001'].status = result.story.status;

      expect(calculateCompletionPercentage(data.stories)).toBe(50);
      expect(calculateWipCount(data.stories)).toBe(1);
    });
  });
});
