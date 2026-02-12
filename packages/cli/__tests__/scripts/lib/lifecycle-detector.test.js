/**
 * Tests for lifecycle-detector.js - Workflow phase detection
 */

const { PHASES, detectLifecyclePhase, getRelevantPhases } = require('../../../scripts/lib/lifecycle-detector');

describe('lifecycle-detector', () => {
  describe('PHASES', () => {
    it('should define 5 lifecycle phases', () => {
      expect(PHASES).toHaveLength(5);
      expect(PHASES).toEqual(['pre-story', 'planning', 'implementation', 'post-impl', 'pre-pr']);
    });
  });

  describe('detectLifecyclePhase', () => {
    it('should return pre-story when no signals provided', () => {
      const result = detectLifecyclePhase();
      expect(result.phase).toBe('pre-story');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('should return pre-story when no active story', () => {
      const result = detectLifecyclePhase({ story: {}, git: {}, session: {}, tests: {} });
      expect(result.phase).toBe('pre-story');
      expect(result.confidence).toBe(0.9);
    });

    it('should return pre-story when story exists but not started', () => {
      const result = detectLifecyclePhase({
        story: { id: 'US-0001', status: 'ready' },
        git: {},
        session: {},
        tests: {},
      });
      expect(result.phase).toBe('pre-story');
      expect(result.confidence).toBe(0.6);
    });

    it('should return planning when plan mode is active', () => {
      const result = detectLifecyclePhase({
        story: { id: 'US-0001', status: 'in-progress' },
        git: { filesChanged: 0 },
        session: { planModeActive: true },
        tests: {},
      });
      expect(result.phase).toBe('planning');
      expect(result.confidence).toBe(0.9);
      expect(result.reason).toContain('Plan mode');
    });

    it('should return planning when story in-progress but no files changed', () => {
      const result = detectLifecyclePhase({
        story: { id: 'US-0001', status: 'in-progress' },
        git: { filesChanged: 0 },
        session: {},
        tests: {},
      });
      expect(result.phase).toBe('planning');
      expect(result.confidence).toBe(0.7);
    });

    it('should return implementation when story in-progress with files changed', () => {
      const result = detectLifecyclePhase({
        story: { id: 'US-0001', status: 'in-progress' },
        git: { filesChanged: 5 },
        session: {},
        tests: {},
      });
      expect(result.phase).toBe('implementation');
      expect(result.confidence).toBe(0.85);
      expect(result.reason).toContain('5 files changed');
    });

    it('should return post-impl when tests passing but changes remain', () => {
      const result = detectLifecyclePhase({
        story: { id: 'US-0001', status: 'in-progress' },
        git: { filesChanged: 3, isClean: false },
        session: {},
        tests: { passing: true },
      });
      expect(result.phase).toBe('post-impl');
      expect(result.confidence).toBe(0.8);
    });

    it('should return pre-pr when tests pass, git clean, on feature branch', () => {
      const result = detectLifecyclePhase({
        story: { id: 'US-0001', status: 'in-progress' },
        git: { filesChanged: 0, isClean: true, onFeatureBranch: true },
        session: {},
        tests: { passing: true },
      });
      expect(result.phase).toBe('pre-pr');
      expect(result.confidence).toBe(0.9);
    });

    it('should NOT return pre-pr when on main branch', () => {
      const result = detectLifecyclePhase({
        story: { id: 'US-0001', status: 'in-progress' },
        git: { filesChanged: 0, isClean: true, onFeatureBranch: false },
        session: {},
        tests: { passing: true },
      });
      // Should fall through to planning (in-progress, no files changed)
      expect(result.phase).toBe('planning');
    });

    it('should prioritize plan mode over implementation', () => {
      const result = detectLifecyclePhase({
        story: { id: 'US-0001', status: 'in-progress' },
        git: { filesChanged: 0 },
        session: { planModeActive: true },
        tests: {},
      });
      expect(result.phase).toBe('planning');
    });

    it('should prioritize pre-pr over post-impl when git is clean', () => {
      const result = detectLifecyclePhase({
        story: { id: 'US-0001', status: 'in-progress' },
        git: { filesChanged: 0, isClean: true, onFeatureBranch: true },
        session: {},
        tests: { passing: true },
      });
      expect(result.phase).toBe('pre-pr');
    });

    it('should handle tests.passing as null (unknown)', () => {
      const result = detectLifecyclePhase({
        story: { id: 'US-0001', status: 'in-progress' },
        git: { filesChanged: 3 },
        session: {},
        tests: { passing: null },
      });
      expect(result.phase).toBe('implementation');
    });
  });

  describe('getRelevantPhases', () => {
    it('should return correct phases for pre-story', () => {
      expect(getRelevantPhases('pre-story')).toEqual(['pre-story']);
    });

    it('should return planning + pre-story for planning phase', () => {
      expect(getRelevantPhases('planning')).toEqual(['pre-story', 'planning']);
    });

    it('should return planning + implementation for implementation phase', () => {
      expect(getRelevantPhases('implementation')).toEqual(['planning', 'implementation']);
    });

    it('should return implementation + post-impl for post-impl phase', () => {
      expect(getRelevantPhases('post-impl')).toEqual(['implementation', 'post-impl']);
    });

    it('should return post-impl + pre-pr for pre-pr phase', () => {
      expect(getRelevantPhases('pre-pr')).toEqual(['post-impl', 'pre-pr']);
    });

    it('should return pre-story for unknown phase', () => {
      expect(getRelevantPhases('unknown')).toEqual(['pre-story']);
    });
  });
});
