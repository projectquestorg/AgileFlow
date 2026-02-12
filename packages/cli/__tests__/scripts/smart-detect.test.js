/**
 * Tests for smart-detect.js - Contextual feature routing orchestrator
 */

const fs = require('fs');
const path = require('path');

// Mock fs for file operations
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  existsSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
}));

// Mock errors module
jest.mock('../../lib/errors', () => ({
  safeReadJSON: jest.fn((filePath, opts = {}) => {
    if (opts.defaultValue !== undefined) {
      return { ok: true, data: opts.defaultValue };
    }
    return { ok: false, error: 'mocked' };
  }),
  safeWriteJSON: jest.fn(() => ({ ok: true })),
}));

const {
  analyze,
  writeRecommendations,
  extractSignals,
  filterRecommendations,
  detectAutoModes,
} = require('../../scripts/smart-detect');

// =============================================================================
// Test Helpers
// =============================================================================

function makePrefetched(overrides = {}) {
  return {
    json: {
      statusJson: { stories: {}, epics: {} },
      sessionState: { active_commands: [] },
      metadata: {},
      ...(overrides.json || {}),
    },
    git: {
      branch: 'main',
      status: '',
      commitShort: 'abc123',
      ...(overrides.git || {}),
    },
    text: {},
    dirs: {},
    ...(overrides.root || {}),
  };
}

// =============================================================================
// extractSignals Tests
// =============================================================================

describe('extractSignals', () => {
  beforeEach(() => {
    fs.existsSync.mockReturnValue(false);
  });

  it('should extract basic signals from prefetched data', () => {
    const prefetched = makePrefetched();
    const signals = extractSignals(prefetched, {}, {});
    expect(signals.statusJson).toEqual({ stories: {}, epics: {} });
    expect(signals.git.branch).toBe('main');
    expect(signals.git.isClean).toBe(true);
    expect(signals.git.onFeatureBranch).toBe(false);
    expect(signals.story).toBeNull();
    expect(signals.storyCount).toBe(0);
  });

  it('should detect feature branch', () => {
    const prefetched = makePrefetched({ git: { branch: 'feature/auth', status: '' } });
    const signals = extractSignals(prefetched, {}, {});
    expect(signals.git.onFeatureBranch).toBe(true);
  });

  it('should count files changed from git status', () => {
    const prefetched = makePrefetched({
      git: { branch: 'main', status: ' M file1.js\n M file2.js\n?? file3.js' },
    });
    const signals = extractSignals(prefetched, {}, {});
    expect(signals.git.filesChanged).toBe(3);
    expect(signals.git.changedFiles).toHaveLength(3);
    expect(signals.git.isClean).toBe(false);
  });

  it('should extract current story from session state', () => {
    const prefetched = makePrefetched({
      json: {
        statusJson: {
          stories: { 'US-042': { status: 'in-progress', title: 'Auth refactor', owner: 'AG-API' } },
        },
        sessionState: { current_session: { current_story: 'US-042' } },
      },
    });
    const signals = extractSignals(
      prefetched,
      { current_session: { current_story: 'US-042' } },
      {}
    );
    expect(signals.story).not.toBeNull();
    expect(signals.story.id).toBe('US-042');
    expect(signals.story.status).toBe('in-progress');
  });

  it('should count stories by status', () => {
    const prefetched = makePrefetched({
      json: {
        statusJson: {
          stories: {
            'US-001': { status: 'ready' },
            'US-002': { status: 'ready' },
            'US-003': { status: 'in-progress' },
            'US-004': { status: 'done' },
          },
        },
      },
    });
    const signals = extractSignals(prefetched, {}, {});
    expect(signals.counts.ready).toBe(2);
    expect(signals.counts['in-progress']).toBe(1);
    expect(signals.counts.done).toBe(1);
    expect(signals.storyCount).toBe(4);
  });

  it('should detect plan mode from active commands', () => {
    const signals = extractSignals(
      makePrefetched(),
      { active_commands: [{ name: 'babysit', active_sections: ['plan-mode'] }] },
      {}
    );
    expect(signals.session.planModeActive).toBe(true);
  });

  it('should extract thresholds from metadata', () => {
    const signals = extractSignals(
      makePrefetched(),
      {},
      { smart_detect: { thresholds: { review_min_lines: 50 } } }
    );
    expect(signals.thresholds.review_min_lines).toBe(50);
  });

  it('should check file existence', () => {
    fs.existsSync.mockImplementation(p => {
      if (p === 'tsconfig.json') return true;
      if (p === 'coverage/coverage-summary.json') return true;
      return false;
    });
    const signals = extractSignals(makePrefetched(), {}, {});
    expect(signals.files.tsconfig).toBe(true);
    expect(signals.files.coverage).toBe(true);
    expect(signals.files.playwright).toBe(false);
  });
});

// =============================================================================
// filterRecommendations Tests
// =============================================================================

describe('filterRecommendations', () => {
  const recommendations = [
    { feature: 'blockers', priority: 'high', trigger: '2 blocked', action: 'suggest' },
    { feature: 'review', priority: 'high', trigger: '200 lines', action: 'suggest' },
    { feature: 'docs', priority: 'medium', trigger: 'API changed', action: 'offer' },
    { feature: 'changelog', priority: 'low', trigger: '5 commits', action: 'offer' },
  ];

  it('should categorize into immediate and available', () => {
    const result = filterRecommendations(recommendations, {}, {});
    expect(result.immediate).toHaveLength(2); // blockers + review (high)
    expect(result.available).toHaveLength(2); // docs + changelog (medium/low)
  });

  it('should filter out disabled features', () => {
    const result = filterRecommendations(
      recommendations,
      { smart_detect: { disabled_features: ['blockers'] } },
      {}
    );
    expect(result.immediate.some(r => r.feature === 'blockers')).toBe(false);
  });

  it('should filter out skipped features', () => {
    const result = filterRecommendations(
      recommendations,
      {},
      { smart_detect: { features_skipped: ['review'] } }
    );
    expect(result.immediate.some(r => r.feature === 'review')).toBe(false);
  });

  it('should move already-offered high-priority to available', () => {
    const result = filterRecommendations(
      recommendations,
      {},
      { smart_detect: { features_offered: ['blockers'] } }
    );
    // blockers was offered already, moves to available
    expect(result.immediate.some(r => r.feature === 'blockers')).toBe(false);
    expect(result.available.some(r => r.feature === 'blockers')).toBe(true);
  });

  it('should apply priority overrides', () => {
    const result = filterRecommendations(
      recommendations,
      { smart_detect: { priority_overrides: { docs: 'high' } } },
      {}
    );
    // docs overridden to high, should be in immediate
    expect(result.immediate.some(r => r.feature === 'docs')).toBe(true);
  });

  it('should sort by priority within categories', () => {
    const mixed = [
      { feature: 'a', priority: 'low', trigger: '', action: 'offer' },
      { feature: 'b', priority: 'medium', trigger: '', action: 'offer' },
    ];
    const result = filterRecommendations(mixed, {}, {});
    expect(result.available[0].feature).toBe('b'); // medium before low
  });
});

// =============================================================================
// detectAutoModes Tests
// =============================================================================

describe('detectAutoModes', () => {
  it('should detect loop mode when 3+ ready stories in epic', () => {
    const signals = {
      story: { epic: 'EP-001' },
      statusJson: {
        stories: {
          'US-001': { epic: 'EP-001', status: 'ready' },
          'US-002': { epic: 'EP-001', status: 'ready' },
          'US-003': { epic: 'EP-001', status: 'ready' },
        },
      },
      files: {},
      packageJson: { scripts: { test: 'jest' } },
    };
    const modes = detectAutoModes(signals);
    expect(modes.loop_mode).toBe(true);
  });

  it('should not detect loop mode without test setup', () => {
    const signals = {
      story: { epic: 'EP-001' },
      statusJson: {
        stories: {
          'US-001': { epic: 'EP-001', status: 'ready' },
          'US-002': { epic: 'EP-001', status: 'ready' },
          'US-003': { epic: 'EP-001', status: 'ready' },
        },
      },
      files: {},
      packageJson: { scripts: {} },
    };
    const modes = detectAutoModes(signals);
    expect(modes.loop_mode).toBe(false);
  });

  it('should detect visual mode when playwright + screenshots exist', () => {
    const signals = {
      story: null,
      statusJson: { stories: {} },
      files: { playwright: true, screenshots: true },
      packageJson: null,
    };
    const modes = detectAutoModes(signals);
    expect(modes.visual_mode).toBe(true);
  });

  it('should detect coverage mode when coverage data exists', () => {
    const signals = {
      story: null,
      statusJson: { stories: {} },
      files: { coverage: true },
      packageJson: null,
    };
    const modes = detectAutoModes(signals);
    expect(modes.coverage_mode).toBe(true);
  });

  it('should return all false when no signals', () => {
    const signals = {
      story: null,
      statusJson: { stories: {} },
      files: {},
      packageJson: null,
    };
    const modes = detectAutoModes(signals);
    expect(modes.loop_mode).toBe(false);
    expect(modes.visual_mode).toBe(false);
    expect(modes.coverage_mode).toBe(false);
  });
});

// =============================================================================
// analyze (Integration) Tests
// =============================================================================

describe('analyze', () => {
  beforeEach(() => {
    fs.existsSync.mockReturnValue(false);
  });

  it('should return complete analysis structure', () => {
    const prefetched = makePrefetched();
    const result = analyze(prefetched);

    expect(result).toHaveProperty('detected_at');
    expect(result).toHaveProperty('lifecycle_phase');
    expect(result).toHaveProperty('phase_confidence');
    expect(result).toHaveProperty('phase_reason');
    expect(result).toHaveProperty('recommendations');
    expect(result.recommendations).toHaveProperty('immediate');
    expect(result.recommendations).toHaveProperty('available');
    expect(result.recommendations).toHaveProperty('auto_enabled');
    expect(result).toHaveProperty('signals_summary');
  });

  it('should detect pre-story phase when no story active', () => {
    const result = analyze(makePrefetched());
    expect(result.lifecycle_phase).toBe('pre-story');
  });

  it('should detect blocked stories as immediate recommendation', () => {
    const prefetched = makePrefetched({
      json: {
        statusJson: {
          stories: {
            'US-001': { status: 'blocked', title: 'Blocked story' },
          },
        },
      },
    });
    const result = analyze(prefetched);
    expect(result.recommendations.immediate.some(r => r.feature === 'blockers')).toBe(true);
  });

  it('should return disabled result when smart_detect disabled', () => {
    const prefetched = makePrefetched();
    const metadata = { smart_detect: { enabled: false } };
    const result = analyze(prefetched, {}, metadata);
    expect(result.disabled).toBe(true);
    expect(result.recommendations.immediate).toEqual([]);
  });

  it('should include signals summary', () => {
    const prefetched = makePrefetched({
      git: { branch: 'feature/test', status: ' M file.js' },
    });
    const result = analyze(prefetched);
    expect(result.signals_summary.files_changed).toBe(1);
    expect(result.signals_summary.on_feature_branch).toBe(true);
  });

  it('should extract session state from prefetched when not provided', () => {
    const prefetched = makePrefetched({
      json: {
        sessionState: { current_session: { started_at: new Date().toISOString() } },
      },
    });
    const result = analyze(prefetched);
    // Should not throw - extracts sessionState from prefetched
    expect(result.lifecycle_phase).toBeDefined();
  });

  it('should apply metadata thresholds', () => {
    const prefetched = makePrefetched({
      json: {
        statusJson: {
          stories: { 'US-001': { status: 'in-progress', title: 'Test' } },
        },
        sessionState: { current_session: { current_story: 'US-001' } },
      },
      git: {
        branch: 'feature/x',
        status: ' M api/route.ts\n M api/handler.ts',
      },
    });
    const metadata = { smart_detect: { thresholds: { review_min_lines: 500 } } };
    const result = analyze(prefetched, { current_session: { current_story: 'US-001' } }, metadata);
    // With high threshold, review should NOT trigger
    expect(result.recommendations.immediate.some(r => r.feature === 'review')).toBe(false);
  });
});

// =============================================================================
// writeRecommendations Tests
// =============================================================================

describe('writeRecommendations', () => {
  it('should call safeWriteJSON with results', () => {
    const errors = require('../../lib/errors');
    const results = { detected_at: '2026-01-01', recommendations: {} };
    writeRecommendations(results, '/tmp/test-output.json');
    expect(errors.safeWriteJSON).toHaveBeenCalledWith(
      '/tmp/test-output.json',
      results,
      { createDir: true }
    );
  });
});
