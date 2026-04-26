/**
 * Unit tests for the strict plugin validator.
 */
import { describe, it, expect } from 'vitest';

import validatorModule from '../../../src/runtime/plugins/validator.js';

const { validatePlugin, validatePluginSet, hasErrors } = validatorModule;

/**
 * @param {Partial<import('../../../src/runtime/plugins/registry.js').PluginManifest>} [overrides]
 */
function valid(overrides = {}) {
  return {
    id: 'core',
    name: 'Core',
    description: 'Essential AgileFlow workflow — Epic, Story, Status, Babysit.',
    version: '1.0.0',
    enabledByDefault: true,
    cannotDisable: true,
    depends: [],
    provides: { commands: [], skills: [], agents: [], hooks: [], templates: [] },
    dir: '/x',
    ...overrides,
  };
}

describe('validatePlugin', () => {
  it('returns no errors for a fully-valid plugin', () => {
    expect(validatePlugin(valid())).toEqual([]);
  });

  describe('id format', () => {
    it('flags non-string id', () => {
      const issues = validatePlugin(valid({ id: 42 }));
      expect(issues.some((i) => /must be a string/.test(i.message))).toBe(true);
    });

    it('flags id with uppercase letters', () => {
      const issues = validatePlugin(valid({ id: 'Core' }));
      expect(issues.some((i) => /must match/.test(i.message))).toBe(true);
    });

    it('flags id with underscores', () => {
      const issues = validatePlugin(valid({ id: 'my_plugin' }));
      expect(issues.some((i) => /must match/.test(i.message))).toBe(true);
    });

    it('accepts kebab-case', () => {
      expect(validatePlugin(valid({ id: 'multi-expert' }))).toEqual([]);
    });
  });

  describe('version (semver)', () => {
    it('flags non-semver versions', () => {
      const issues = validatePlugin(valid({ version: 'beta' }));
      expect(issues.some((i) => /valid semver/.test(i.message))).toBe(true);
    });

    it('accepts pre-release tags', () => {
      expect(validatePlugin(valid({ version: '1.0.0-alpha.1' }))).toEqual([]);
    });

    it('accepts build metadata', () => {
      expect(validatePlugin(valid({ version: '1.0.0+20260420' }))).toEqual([]);
    });
  });

  describe('description', () => {
    it('flags missing description', () => {
      const issues = validatePlugin(valid({ description: '   ' }));
      expect(issues.some((i) => /non-empty/.test(i.message))).toBe(true);
    });

    it('warns on overly short descriptions', () => {
      const issues = validatePlugin(valid({ description: 'short' }));
      expect(issues.some((i) => i.severity === 'warning')).toBe(true);
    });
  });

  describe('booleans', () => {
    it('flags non-boolean enabledByDefault', () => {
      const issues = validatePlugin(valid({ enabledByDefault: 'yes' }));
      expect(issues.some((i) => /enabledByDefault.*boolean/.test(i.message))).toBe(true);
    });

    it('flags non-boolean cannotDisable', () => {
      const issues = validatePlugin(valid({ cannotDisable: 1 }));
      expect(issues.some((i) => /cannotDisable.*boolean/.test(i.message))).toBe(true);
    });

    it('flags cannotDisable without enabledByDefault', () => {
      const issues = validatePlugin(
        valid({ cannotDisable: true, enabledByDefault: false }),
      );
      expect(
        issues.some((i) => /cannotDisable: true.*enabledByDefault: true/.test(i.message)),
      ).toBe(true);
    });
  });

  describe('depends', () => {
    it('flags non-array depends', () => {
      const issues = validatePlugin(valid({ depends: 'core' }));
      expect(issues.some((i) => /must be an array/.test(i.message))).toBe(true);
    });

    it('flags entries that are not valid plugin ids', () => {
      const issues = validatePlugin(valid({ depends: ['Core', '_bad'] }));
      expect(issues.filter((i) => i.severity === 'error').length).toBeGreaterThanOrEqual(2);
    });

    it('flags self-dependency', () => {
      const issues = validatePlugin(valid({ depends: ['core'] }));
      expect(issues.some((i) => /cannot depend on itself/.test(i.message))).toBe(true);
    });

    it('warns on duplicate dependency entries', () => {
      const issues = validatePlugin(
        valid({ id: 'ads', depends: ['core', 'core'] }),
      );
      expect(issues.some((i) => i.severity === 'warning')).toBe(true);
    });
  });

  describe('provides', () => {
    it('flags non-object provides', () => {
      const issues = validatePlugin(valid({ provides: ['commands'] }));
      expect(issues.some((i) => /must be an object/.test(i.message))).toBe(true);
    });

    it('flags non-array sub-keys', () => {
      const issues = validatePlugin(
        valid({ provides: { commands: 'epic.md' } }),
      );
      expect(issues.some((i) => /must be an array/.test(i.message))).toBe(true);
    });

    it('warns on unknown provides keys', () => {
      const issues = validatePlugin(
        valid({ provides: { commands: [], junk: [] } }),
      );
      expect(issues.some((i) => /not a recognized key/.test(i.message))).toBe(true);
    });
  });
});

describe('validatePluginSet', () => {
  it('returns aggregated issues across all plugins', () => {
    const plugins = [
      valid({ id: 'a', cannotDisable: false, enabledByDefault: false }),
      valid({ id: 'B', cannotDisable: false, enabledByDefault: false }), // bad id
    ];
    const issues = validatePluginSet(plugins);
    expect(issues.some((i) => i.pluginId === 'B')).toBe(true);
  });

  it('flags duplicate plugin ids', () => {
    const plugins = [
      valid({ id: 'core' }),
      valid({ id: 'core', cannotDisable: false, enabledByDefault: false }),
    ];
    const issues = validatePluginSet(plugins);
    expect(issues.some((i) => /Duplicate plugin id/.test(i.message))).toBe(true);
  });

  it('flags depends references that do not resolve', () => {
    const plugins = [
      valid({ id: 'core' }),
      valid({
        id: 'orphan',
        cannotDisable: false,
        enabledByDefault: false,
        depends: ['nonexistent'],
      }),
    ];
    const issues = validatePluginSet(plugins);
    expect(issues.some((i) => /unknown plugin "nonexistent"/.test(i.message))).toBe(true);
  });
});

describe('hasErrors', () => {
  it('returns true when any error-severity issue exists', () => {
    expect(hasErrors([{ severity: 'error', pluginId: 'a', message: 'x' }])).toBe(true);
  });

  it('returns false for warnings-only', () => {
    expect(hasErrors([{ severity: 'warning', pluginId: 'a', message: 'x' }])).toBe(false);
  });

  it('returns false for empty array', () => {
    expect(hasErrors([])).toBe(false);
  });
});
