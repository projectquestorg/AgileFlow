/**
 * Tests for feature-catalog.js - Static feature catalog with dynamic status
 */

const {
  FEATURE_CATALOG,
  VALID_CATEGORIES,
  VALID_STATUSES,
  buildCatalogWithStatus,
  resolveSignalPath,
  checkPrerequisites,
} = require('../../../scripts/lib/feature-catalog');

// =============================================================================
// Static Catalog Validation
// =============================================================================

describe('FEATURE_CATALOG', () => {
  it('should have entries', () => {
    expect(FEATURE_CATALOG.length).toBeGreaterThanOrEqual(15);
  });

  it('should have required fields on all entries', () => {
    for (const entry of FEATURE_CATALOG) {
      expect(entry).toHaveProperty('feature');
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('description');
      expect(entry).toHaveProperty('how_to_use');
      expect(entry).toHaveProperty('category');
      expect(typeof entry.feature).toBe('string');
      expect(typeof entry.name).toBe('string');
      expect(typeof entry.description).toBe('string');
      expect(typeof entry.how_to_use).toBe('string');
      expect(typeof entry.category).toBe('string');
    }
  });

  it('should have no duplicate feature keys', () => {
    const keys = FEATURE_CATALOG.map(e => e.feature);
    const unique = new Set(keys);
    expect(unique.size).toBe(keys.length);
  });

  it('should only use valid categories', () => {
    for (const entry of FEATURE_CATALOG) {
      expect(VALID_CATEGORIES).toContain(entry.category);
    }
  });

  it('should have all 5 categories represented', () => {
    const categories = new Set(FEATURE_CATALOG.map(e => e.category));
    for (const cat of VALID_CATEGORIES) {
      expect(categories.has(cat)).toBe(true);
    }
  });

  it('should have valid prerequisites format', () => {
    for (const entry of FEATURE_CATALOG) {
      if (entry.prerequisites !== null) {
        expect(Array.isArray(entry.prerequisites)).toBe(true);
        for (const prereq of entry.prerequisites) {
          expect(prereq).toHaveProperty('signal_path');
          expect(prereq).toHaveProperty('description');
          expect(typeof prereq.signal_path).toBe('string');
          expect(typeof prereq.description).toBe('string');
        }
      }
    }
  });
});

// =============================================================================
// resolveSignalPath Tests
// =============================================================================

describe('resolveSignalPath', () => {
  it('should resolve a top-level key', () => {
    expect(resolveSignalPath({ foo: 42 }, 'foo')).toBe(42);
  });

  it('should resolve nested paths', () => {
    expect(resolveSignalPath({ a: { b: { c: 'deep' } } }, 'a.b.c')).toBe('deep');
  });

  it('should return undefined for missing paths', () => {
    expect(resolveSignalPath({ a: 1 }, 'b')).toBeUndefined();
    expect(resolveSignalPath({ a: { b: 1 } }, 'a.c')).toBeUndefined();
  });

  it('should return undefined when intermediate is null', () => {
    expect(resolveSignalPath({ a: null }, 'a.b')).toBeUndefined();
  });

  it('should handle empty object', () => {
    expect(resolveSignalPath({}, 'anything')).toBeUndefined();
  });
});

// =============================================================================
// checkPrerequisites Tests
// =============================================================================

describe('checkPrerequisites', () => {
  it('should return true when prerequisites is null', () => {
    expect(checkPrerequisites({}, null)).toBe(true);
  });

  it('should return true when prerequisites is empty', () => {
    expect(checkPrerequisites({}, [])).toBe(true);
  });

  it('should return true when all prereqs are met', () => {
    const signals = { story: { epic: 'EP-001' }, tests: { hasTestSetup: true } };
    const prereqs = [
      { signal_path: 'story.epic', description: 'test' },
      { signal_path: 'tests.hasTestSetup', description: 'test' },
    ];
    expect(checkPrerequisites(signals, prereqs)).toBe(true);
  });

  it('should return false when any prereq is not met', () => {
    const signals = { story: { epic: 'EP-001' }, tests: { hasTestSetup: false } };
    const prereqs = [
      { signal_path: 'story.epic', description: 'test' },
      { signal_path: 'tests.hasTestSetup', description: 'test' },
    ];
    expect(checkPrerequisites(signals, prereqs)).toBe(false);
  });

  it('should return false when path is missing entirely', () => {
    const prereqs = [{ signal_path: 'nonexistent.path', description: 'test' }];
    expect(checkPrerequisites({}, prereqs)).toBe(false);
  });
});

// =============================================================================
// buildCatalogWithStatus Tests
// =============================================================================

describe('buildCatalogWithStatus', () => {
  const baseSignals = {
    story: null,
    statusJson: { stories: {} },
    files: {},
    packageJson: null,
    tests: { hasTestSetup: false },
    storyCount: 0,
  };

  it('should return all catalog entries with status field', () => {
    const catalog = buildCatalogWithStatus(baseSignals, { immediate: [], available: [] }, {}, {});
    expect(catalog).toHaveLength(FEATURE_CATALOG.length);
    for (const entry of catalog) {
      expect(VALID_STATUSES).toContain(entry.status);
    }
  });

  it('should mark features with no prereqs as available', () => {
    const catalog = buildCatalogWithStatus(baseSignals, { immediate: [], available: [] }, {}, {});
    const agentTeams = catalog.find(e => e.feature === 'agent-teams');
    expect(agentTeams.status).toBe('available');
  });

  it('should mark features with unmet prereqs as unavailable', () => {
    const catalog = buildCatalogWithStatus(baseSignals, { immediate: [], available: [] }, {}, {});
    const loopMode = catalog.find(e => e.feature === 'loop-mode');
    expect(loopMode.status).toBe('unavailable');
  });

  it('should mark auto-enabled modes as triggered', () => {
    const autoEnabled = { loop_mode: true, visual_mode: false, coverage_mode: false };
    const catalog = buildCatalogWithStatus(
      baseSignals,
      { immediate: [], available: [] },
      autoEnabled,
      {}
    );
    const loopMode = catalog.find(e => e.feature === 'loop-mode');
    expect(loopMode.status).toBe('triggered');
  });

  it('should mark recommendation-triggered features as triggered', () => {
    const recs = {
      immediate: [{ feature: 'impact-analysis', priority: 'high', trigger: 'test' }],
      available: [],
    };
    const catalog = buildCatalogWithStatus(baseSignals, recs, {}, {});
    const impact = catalog.find(e => e.feature === 'impact-analysis');
    expect(impact.status).toBe('triggered');
  });

  it('should mark features with matching detector as triggered', () => {
    const recs = {
      immediate: [],
      available: [{ feature: 'impact', priority: 'medium', trigger: 'changed files' }],
    };
    const catalog = buildCatalogWithStatus(baseSignals, recs, {}, {});
    const impact = catalog.find(e => e.feature === 'impact-analysis');
    // impact-analysis has detector='impact', and 'impact' is in available recs
    expect(impact.status).toBe('triggered');
  });

  it('should mark disabled features as disabled', () => {
    const metadata = { smart_detect: { disabled_features: ['council', 'sessions'] } };
    const catalog = buildCatalogWithStatus(
      baseSignals,
      { immediate: [], available: [] },
      {},
      metadata
    );
    const council = catalog.find(e => e.feature === 'council');
    const sessions = catalog.find(e => e.feature === 'sessions');
    expect(council.status).toBe('disabled');
    expect(sessions.status).toBe('disabled');
  });

  it('should prioritize disabled over triggered', () => {
    const metadata = { smart_detect: { disabled_features: ['loop-mode'] } };
    const autoEnabled = { loop_mode: true };
    const catalog = buildCatalogWithStatus(
      baseSignals,
      { immediate: [], available: [] },
      autoEnabled,
      metadata
    );
    const loopMode = catalog.find(e => e.feature === 'loop-mode');
    expect(loopMode.status).toBe('disabled');
  });

  it('should mark features with met prereqs as available', () => {
    const signals = {
      ...baseSignals,
      story: { epic: 'EP-001' },
      tests: { hasTestSetup: true },
    };
    const catalog = buildCatalogWithStatus(signals, { immediate: [], available: [] }, {}, {});
    const loopMode = catalog.find(e => e.feature === 'loop-mode');
    expect(loopMode.status).toBe('available');
  });

  it('should handle null recommendations gracefully', () => {
    const catalog = buildCatalogWithStatus(baseSignals, null, null, null);
    expect(catalog).toHaveLength(FEATURE_CATALOG.length);
    for (const entry of catalog) {
      expect(VALID_STATUSES).toContain(entry.status);
    }
  });

  it('should preserve all original fields on entries', () => {
    const catalog = buildCatalogWithStatus(baseSignals, { immediate: [], available: [] }, {}, {});
    for (const entry of catalog) {
      expect(entry).toHaveProperty('feature');
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('description');
      expect(entry).toHaveProperty('how_to_use');
      expect(entry).toHaveProperty('category');
      expect(entry).toHaveProperty('status');
    }
  });
});
