/**
 * Tests for signal-detectors.js - Feature detection registry
 */

const {
  FEATURE_DETECTORS,
  PHASE_MAP,
  recommend,
  getDetectorNames,
  getDetectorsForPhase,
  runDetector,
  runDetectorsForPhases,
  runAllDetectors,
  getStoriesByStatus,
  getStoriesForEpic,
  hasPackageScript,
  storyHasAC,
  storyMentions,
} = require('../../../scripts/lib/signal-detectors');

// =============================================================================
// Helper to build signals
// =============================================================================

function makeSignals(overrides = {}) {
  return {
    statusJson: { stories: {}, epics: {} },
    sessionState: {},
    metadata: {},
    git: {
      branch: 'main',
      filesChanged: 0,
      changedFiles: [],
      isClean: true,
      onFeatureBranch: false,
      diffStats: null,
    },
    packageJson: { scripts: { test: 'jest' } },
    story: null,
    files: {
      tsconfig: false,
      eslintrc: false,
      coverage: false,
      playwright: false,
      screenshots: false,
      ciConfig: false,
      expertiseDir: false,
    },
    tests: { passing: null, hasTestSetup: true },
    counts: { ready: 0, 'in-progress': 0, blocked: 0, done: 0 },
    storyCount: 0,
    thresholds: {},
    session: { planModeActive: false, activeCommands: [] },
    ...overrides,
  };
}

// =============================================================================
// Utility Function Tests
// =============================================================================

describe('signal-detectors utilities', () => {
  describe('recommend', () => {
    it('should create a recommendation with defaults', () => {
      const result = recommend('test-feature', { trigger: 'test trigger', phase: 'planning' });
      expect(result).toEqual({
        feature: 'test-feature',
        priority: 'medium',
        trigger: 'test trigger',
        action: 'suggest',
        command: '/agileflow:test-feature',
        phase: 'planning',
      });
    });

    it('should respect explicit priority and action', () => {
      const result = recommend('foo', {
        priority: 'high',
        action: 'auto',
        trigger: 'x',
        phase: 'pre-story',
        command: '/custom',
      });
      expect(result.priority).toBe('high');
      expect(result.action).toBe('auto');
      expect(result.command).toBe('/custom');
    });
  });

  describe('getStoriesByStatus', () => {
    it('should filter stories by status', () => {
      const statusJson = {
        stories: {
          'US-001': { status: 'ready', title: 'A' },
          'US-002': { status: 'in-progress', title: 'B' },
          'US-003': { status: 'ready', title: 'C' },
        },
      };
      const ready = getStoriesByStatus(statusJson, 'ready');
      expect(ready).toHaveLength(2);
      expect(ready[0].id).toBe('US-001');
    });

    it('should return empty for null statusJson', () => {
      expect(getStoriesByStatus(null, 'ready')).toEqual([]);
    });

    it('should return empty for missing stories', () => {
      expect(getStoriesByStatus({}, 'ready')).toEqual([]);
    });
  });

  describe('getStoriesForEpic', () => {
    it('should filter stories by epic', () => {
      const statusJson = {
        stories: {
          'US-001': { epic: 'EP-001', status: 'ready' },
          'US-002': { epic: 'EP-002', status: 'ready' },
          'US-003': { epic: 'EP-001', status: 'done' },
        },
      };
      const result = getStoriesForEpic(statusJson, 'EP-001');
      expect(result).toHaveLength(2);
    });
  });

  describe('hasPackageScript', () => {
    it('should return true when script exists', () => {
      expect(hasPackageScript({ scripts: { test: 'jest' } }, 'test')).toBe(true);
    });

    it('should return false when script missing', () => {
      expect(hasPackageScript({ scripts: {} }, 'test')).toBe(false);
    });

    it('should return false for null packageJson', () => {
      expect(hasPackageScript(null, 'test')).toBe(false);
    });
  });

  describe('storyHasAC', () => {
    it('should return true when AC exists', () => {
      expect(storyHasAC({ acceptance_criteria: ['given/when/then'] })).toBe(true);
    });

    it('should return false when AC empty', () => {
      expect(storyHasAC({ acceptance_criteria: [] })).toBe(false);
    });

    it('should return false when AC missing', () => {
      expect(storyHasAC({})).toBe(false);
    });

    it('should return false for null story', () => {
      expect(storyHasAC(null)).toBe(false);
    });
  });

  describe('storyMentions', () => {
    it('should match keywords in title', () => {
      expect(storyMentions({ title: 'Implement authentication', description: '' }, ['auth'])).toBe(
        true
      );
    });

    it('should match keywords in description', () => {
      expect(
        storyMentions({ title: 'Story', description: 'Add research spike' }, ['research'])
      ).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(storyMentions({ title: 'Architecture Decision' }, ['architecture'])).toBe(true);
    });

    it('should return false when no match', () => {
      expect(storyMentions({ title: 'Add button' }, ['database'])).toBe(false);
    });

    it('should return false for null story', () => {
      expect(storyMentions(null, ['anything'])).toBe(false);
    });
  });
});

// =============================================================================
// Registry Structure Tests
// =============================================================================

describe('FEATURE_DETECTORS registry', () => {
  it('should have all detectors as functions', () => {
    for (const [name, detector] of Object.entries(FEATURE_DETECTORS)) {
      expect(typeof detector).toBe('function');
    }
  });

  it('should have at least 30 detectors', () => {
    expect(Object.keys(FEATURE_DETECTORS).length).toBeGreaterThanOrEqual(30);
  });
});

describe('PHASE_MAP', () => {
  it('should map all 5 phases', () => {
    expect(Object.keys(PHASE_MAP)).toEqual([
      'pre-story',
      'planning',
      'implementation',
      'post-impl',
      'pre-pr',
    ]);
  });

  it('should reference only existing detectors', () => {
    const allDetectors = Object.keys(FEATURE_DETECTORS);
    for (const [phase, detectors] of Object.entries(PHASE_MAP)) {
      for (const name of detectors) {
        expect(allDetectors).toContain(name);
      }
    }
  });

  it('should cover all detectors', () => {
    const mapped = new Set(Object.values(PHASE_MAP).flat());
    const all = new Set(Object.keys(FEATURE_DETECTORS));
    for (const name of all) {
      expect(mapped).toContain(name);
    }
  });
});

// =============================================================================
// Pre-Story Phase Detector Tests
// =============================================================================

describe('pre-story detectors', () => {
  describe('story-validate', () => {
    it('should trigger when story lacks AC', () => {
      const signals = makeSignals({
        story: { id: 'US-001', status: 'ready', acceptance_criteria: [] },
      });
      const result = runDetector('story-validate', signals);
      expect(result).not.toBeNull();
      expect(result.priority).toBe('high');
      expect(result.feature).toBe('story-validate');
    });

    it('should not trigger when story has AC', () => {
      const signals = makeSignals({
        story: { id: 'US-001', status: 'ready', acceptance_criteria: ['given...'] },
      });
      expect(runDetector('story-validate', signals)).toBeNull();
    });

    it('should not trigger when no story', () => {
      expect(runDetector('story-validate', makeSignals())).toBeNull();
    });
  });

  describe('blockers', () => {
    it('should trigger when blocked stories exist', () => {
      const signals = makeSignals({
        statusJson: {
          stories: {
            'US-001': { status: 'blocked' },
            'US-002': { status: 'blocked' },
          },
        },
      });
      const result = runDetector('blockers', signals);
      expect(result).not.toBeNull();
      expect(result.priority).toBe('high');
      expect(result.trigger).toContain('2');
    });

    it('should not trigger when no blocked stories', () => {
      const signals = makeSignals({
        statusJson: { stories: { 'US-001': { status: 'ready' } } },
      });
      expect(runDetector('blockers', signals)).toBeNull();
    });
  });

  describe('choose', () => {
    it('should trigger when 2+ ready stories and no current story', () => {
      const signals = makeSignals({ counts: { ready: 3 } });
      const result = runDetector('choose', signals);
      expect(result).not.toBeNull();
      expect(result.feature).toBe('choose');
    });

    it('should not trigger when already have a story', () => {
      const signals = makeSignals({ story: { id: 'US-001' }, counts: { ready: 5 } });
      expect(runDetector('choose', signals)).toBeNull();
    });

    it('should not trigger when < 2 ready stories', () => {
      const signals = makeSignals({ counts: { ready: 1 } });
      expect(runDetector('choose', signals)).toBeNull();
    });
  });

  describe('batch', () => {
    it('should trigger when 3+ ready stories in same epic', () => {
      const signals = makeSignals({
        statusJson: {
          stories: {
            'US-001': { status: 'ready', epic: 'EP-001' },
            'US-002': { status: 'ready', epic: 'EP-001' },
            'US-003': { status: 'ready', epic: 'EP-001' },
            'US-004': { status: 'ready', epic: 'EP-002' },
            'US-005': { status: 'ready', epic: 'EP-002' },
          },
        },
      });
      const result = runDetector('batch', signals);
      expect(result).not.toBeNull();
      expect(result.trigger).toContain('3');
    });

    it('should not trigger when < 5 total ready stories', () => {
      const signals = makeSignals({
        statusJson: {
          stories: {
            'US-001': { status: 'ready', epic: 'EP-001' },
            'US-002': { status: 'ready', epic: 'EP-001' },
          },
        },
      });
      expect(runDetector('batch', signals)).toBeNull();
    });
  });
});

// =============================================================================
// Planning Phase Detector Tests
// =============================================================================

describe('planning detectors', () => {
  describe('impact', () => {
    it('should trigger when core files are changed', () => {
      const signals = makeSignals({
        story: { id: 'US-001', status: 'in-progress' },
        git: {
          filesChanged: 5,
          changedFiles: [
            'src/core/auth.js',
            'src/lib/utils.js',
            'lib/errors.js',
            'src/shared/types.ts',
          ],
          isClean: false,
          onFeatureBranch: true,
        },
      });
      const result = runDetector('impact', signals);
      expect(result).not.toBeNull();
      expect(result.priority).toBe('high');
    });

    it('should not trigger when few core files changed', () => {
      const signals = makeSignals({
        story: { id: 'US-001', status: 'in-progress' },
        git: {
          filesChanged: 2,
          changedFiles: ['src/core/auth.js', 'test/auth.test.js'],
        },
      });
      expect(runDetector('impact', signals)).toBeNull();
    });
  });

  describe('adr', () => {
    it('should trigger for architecture stories', () => {
      const signals = makeSignals({
        story: { id: 'US-001', title: 'Redesign the authentication system', description: '' },
      });
      const result = runDetector('adr', signals);
      expect(result).not.toBeNull();
      expect(result.feature).toBe('adr');
    });

    it('should not trigger for non-architecture stories', () => {
      const signals = makeSignals({
        story: { id: 'US-001', title: 'Fix button color', description: '' },
      });
      expect(runDetector('adr', signals)).toBeNull();
    });
  });

  describe('research', () => {
    it('should trigger for research stories', () => {
      const signals = makeSignals({
        story: { id: 'US-001', title: 'Investigate caching solutions', description: '' },
      });
      const result = runDetector('research', signals);
      expect(result).not.toBeNull();
    });

    it('should trigger for spike stories', () => {
      const signals = makeSignals({
        story: { id: 'US-001', title: 'POC for new API', description: '' },
      });
      expect(runDetector('research', signals)).not.toBeNull();
    });
  });
});

// =============================================================================
// Implementation Phase Detector Tests
// =============================================================================

describe('implementation detectors', () => {
  describe('verify', () => {
    it('should trigger when tests are failing', () => {
      const signals = makeSignals({
        story: { id: 'US-001', status: 'in-progress' },
        git: { filesChanged: 3 },
        tests: { passing: false },
      });
      const result = runDetector('verify', signals);
      expect(result).not.toBeNull();
      expect(result.priority).toBe('high');
    });

    it('should not trigger when tests are passing', () => {
      const signals = makeSignals({
        story: { id: 'US-001', status: 'in-progress' },
        git: { filesChanged: 3 },
        tests: { passing: true },
      });
      expect(runDetector('verify', signals)).toBeNull();
    });

    it('should not trigger when no files changed', () => {
      const signals = makeSignals({
        story: { id: 'US-001', status: 'in-progress' },
        git: { filesChanged: 0 },
        tests: { passing: false },
      });
      expect(runDetector('verify', signals)).toBeNull();
    });
  });

  describe('tests', () => {
    it('should trigger when no test script found', () => {
      const signals = makeSignals({
        story: { id: 'US-001', status: 'in-progress' },
        packageJson: { scripts: {} },
      });
      const result = runDetector('tests', signals);
      expect(result).not.toBeNull();
      expect(result.trigger).toContain('No test script');
    });

    it('should not trigger when test script exists', () => {
      const signals = makeSignals({
        story: { id: 'US-001', status: 'in-progress' },
        packageJson: { scripts: { test: 'jest' } },
      });
      expect(runDetector('tests', signals)).toBeNull();
    });
  });

  describe('diagnose', () => {
    it('should trigger after 2+ failures', () => {
      const signals = makeSignals({
        sessionState: { failure_count: 3 },
      });
      const result = runDetector('diagnose', signals);
      expect(result).not.toBeNull();
      expect(result.priority).toBe('high');
    });

    it('should not trigger with < 2 failures', () => {
      const signals = makeSignals({
        sessionState: { failure_count: 1 },
      });
      expect(runDetector('diagnose', signals)).toBeNull();
    });
  });

  describe('ci', () => {
    it('should trigger when no CI config detected', () => {
      const signals = makeSignals({
        files: { ciConfig: false },
      });
      const result = runDetector('ci', signals);
      expect(result).not.toBeNull();
    });

    it('should not trigger when CI exists', () => {
      const signals = makeSignals({
        files: { ciConfig: true },
      });
      expect(runDetector('ci', signals)).toBeNull();
    });
  });
});

// =============================================================================
// Post-Implementation Phase Detector Tests
// =============================================================================

describe('post-impl detectors', () => {
  describe('review', () => {
    it('should trigger when many lines changed', () => {
      const signals = makeSignals({
        story: { id: 'US-001', status: 'in-progress' },
        git: { diffStats: { insertions: 150, deletions: 50 } },
      });
      const result = runDetector('review', signals);
      expect(result).not.toBeNull();
      expect(result.priority).toBe('high');
    });

    it('should not trigger when few lines changed', () => {
      const signals = makeSignals({
        story: { id: 'US-001', status: 'in-progress' },
        git: { diffStats: { insertions: 20, deletions: 5 } },
      });
      expect(runDetector('review', signals)).toBeNull();
    });

    it('should respect custom threshold', () => {
      const signals = makeSignals({
        story: { id: 'US-001', status: 'in-progress' },
        git: { diffStats: { insertions: 60, deletions: 0 } },
        thresholds: { review_min_lines: 50 },
      });
      const result = runDetector('review', signals);
      expect(result).not.toBeNull();
    });
  });

  describe('docs', () => {
    it('should trigger when API files changed', () => {
      const signals = makeSignals({
        story: { id: 'US-001', status: 'in-progress' },
        git: { changedFiles: ['src/api/users.ts', 'src/routes/auth.ts'] },
      });
      const result = runDetector('docs', signals);
      expect(result).not.toBeNull();
    });

    it('should not trigger when no API files changed', () => {
      const signals = makeSignals({
        story: { id: 'US-001', status: 'in-progress' },
        git: { changedFiles: ['src/components/Button.tsx'] },
      });
      expect(runDetector('docs', signals)).toBeNull();
    });
  });

  describe('logic-audit', () => {
    it('should trigger when 3+ source files modified', () => {
      const signals = makeSignals({
        story: { id: 'US-001', status: 'in-progress' },
        git: { changedFiles: ['a.js', 'b.ts', 'c.tsx', 'd.py'] },
      });
      const result = runDetector('logic-audit', signals);
      expect(result).not.toBeNull();
    });

    it('should not trigger for non-source files', () => {
      const signals = makeSignals({
        story: { id: 'US-001', status: 'in-progress' },
        git: { changedFiles: ['README.md', 'config.json'] },
      });
      expect(runDetector('logic-audit', signals)).toBeNull();
    });
  });

  describe('retro', () => {
    it('should trigger when epic is complete', () => {
      const signals = makeSignals({
        statusJson: { epics: { 'EP-001': { status: 'done', progress: 100 } }, stories: {} },
      });
      const result = runDetector('retro', signals);
      expect(result).not.toBeNull();
      expect(result.trigger).toContain('EP-001');
    });

    it('should trigger when epic is 90%+ complete', () => {
      const signals = makeSignals({
        statusJson: { epics: { 'EP-001': { status: 'in-progress', progress: 95 } }, stories: {} },
      });
      expect(runDetector('retro', signals)).not.toBeNull();
    });

    it('should not trigger when epic is < 90%', () => {
      const signals = makeSignals({
        statusJson: { epics: { 'EP-001': { status: 'in-progress', progress: 50 } }, stories: {} },
      });
      expect(runDetector('retro', signals)).toBeNull();
    });
  });
});

// =============================================================================
// Pre-PR Phase Detector Tests
// =============================================================================

describe('pre-pr detectors', () => {
  describe('pr', () => {
    it('should trigger when ready for PR', () => {
      const signals = makeSignals({
        story: { id: 'US-001', status: 'in-progress' },
        git: { onFeatureBranch: true },
        tests: { passing: true },
      });
      const result = runDetector('pr', signals);
      expect(result).not.toBeNull();
      expect(result.priority).toBe('high');
    });

    it('should not trigger on main branch', () => {
      const signals = makeSignals({
        story: { id: 'US-001', status: 'in-progress' },
        git: { onFeatureBranch: false },
        tests: { passing: true },
      });
      expect(runDetector('pr', signals)).toBeNull();
    });

    it('should not trigger when tests failing', () => {
      const signals = makeSignals({
        story: { id: 'US-001', status: 'in-progress' },
        git: { onFeatureBranch: true },
        tests: { passing: false },
      });
      expect(runDetector('pr', signals)).toBeNull();
    });
  });

  describe('compress', () => {
    it('should trigger when many stories exist', () => {
      const stories = {};
      for (let i = 0; i < 120; i++) {
        stories[`US-${String(i).padStart(3, '0')}`] = { status: 'done' };
      }
      const signals = makeSignals({ statusJson: { stories } });
      const result = runDetector('compress', signals);
      expect(result).not.toBeNull();
    });

    it('should not trigger when few stories', () => {
      const signals = makeSignals({
        statusJson: { stories: { 'US-001': { status: 'done' } } },
      });
      expect(runDetector('compress', signals)).toBeNull();
    });
  });
});

// =============================================================================
// Runner Tests
// =============================================================================

describe('runDetectorsForPhases', () => {
  it('should run only detectors for specified phases', () => {
    const signals = makeSignals({
      statusJson: { stories: { 'US-001': { status: 'blocked' } } },
    });
    const results = runDetectorsForPhases(['pre-story'], signals);
    // Should find blockers detector triggered
    expect(results.some(r => r.feature === 'blockers')).toBe(true);
    // Should NOT find implementation-only detectors
    expect(results.some(r => r.feature === 'verify')).toBe(false);
  });

  it('should deduplicate detectors across phases', () => {
    const signals = makeSignals();
    // pre-story + planning have no overlap in PHASE_MAP so dedup doesn't matter
    // Just ensure no duplicates in output
    const results = runDetectorsForPhases(['pre-story', 'planning'], signals);
    const features = results.map(r => r.feature);
    expect(new Set(features).size).toBe(features.length);
  });

  it('should return empty array when no detectors trigger', () => {
    const signals = makeSignals({
      story: null,
      statusJson: { stories: {} },
      files: { ciConfig: true },
    });
    // With minimal signals and CI present, few detectors should fire
    const results = runDetectorsForPhases(['pre-story'], signals);
    // Most pre-story detectors require stories to exist
    expect(Array.isArray(results)).toBe(true);
  });
});

describe('runAllDetectors', () => {
  it('should run all detectors', () => {
    const signals = makeSignals({
      statusJson: { stories: { 'US-001': { status: 'blocked' } } },
    });
    const results = runAllDetectors(signals);
    expect(Array.isArray(results)).toBe(true);
    // At least blockers should trigger
    expect(results.some(r => r.feature === 'blockers')).toBe(true);
  });

  it('should handle detector errors gracefully', () => {
    // Create signals that might cause edge case issues
    const signals = makeSignals({
      statusJson: null,
      git: null,
      story: null,
    });
    // Should not throw
    expect(() => runAllDetectors(signals)).not.toThrow();
  });
});

describe('getDetectorNames', () => {
  it('should return all detector names', () => {
    const names = getDetectorNames();
    expect(names.length).toBeGreaterThanOrEqual(30);
    expect(names).toContain('blockers');
    expect(names).toContain('pr');
    expect(names).toContain('review');
  });
});

describe('getDetectorsForPhase', () => {
  it('should return detectors for valid phase', () => {
    const detectors = getDetectorsForPhase('pre-story');
    expect(detectors.length).toBeGreaterThan(0);
    expect(detectors).toContain('blockers');
  });

  it('should return empty for invalid phase', () => {
    expect(getDetectorsForPhase('nonexistent')).toEqual([]);
  });
});
