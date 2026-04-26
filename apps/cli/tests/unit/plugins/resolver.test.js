/**
 * Unit tests for the plugin dependency resolver.
 *
 * Plugins are constructed inline as minimal manifests; `discoverPlugins`
 * shape is mimicked (id, depends, cannotDisable). The resolver does not
 * touch the filesystem.
 */
import { describe, it, expect } from 'vitest';

import resolverModule from '../../../src/runtime/plugins/resolver.js';

const { resolvePlugins } = resolverModule;

/**
 * @param {string} id
 * @param {Partial<{ depends: string[], cannotDisable: boolean }>} [opts]
 */
function p(id, opts = {}) {
  return {
    id,
    name: id,
    description: `${id} plugin`,
    version: '1.0.0',
    enabledByDefault: false,
    cannotDisable: Boolean(opts.cannotDisable),
    depends: opts.depends || [],
    provides: { commands: [], skills: [], agents: [], hooks: [], templates: [] },
    dir: `/tmp/plugins/${id}`,
  };
}

describe('resolvePlugins — basics', () => {
  it('returns only cannotDisable plugins when nothing is selected', () => {
    const plugins = [p('core', { cannotDisable: true }), p('seo'), p('ads')];
    const { ordered, autoEnabled } = resolvePlugins(plugins, []);
    expect(ordered.map((x) => x.id)).toEqual(['core']);
    expect(autoEnabled).toEqual([]);
  });

  it('includes user-selected plugins plus cannotDisable', () => {
    const plugins = [p('core', { cannotDisable: true }), p('seo'), p('ads')];
    const { ordered, autoEnabled } = resolvePlugins(plugins, ['seo']);
    expect(new Set(ordered.map((x) => x.id))).toEqual(new Set(['core', 'seo']));
    expect(autoEnabled).toEqual([]);
  });

  it('places dependencies before dependents in install order', () => {
    const plugins = [
      p('core', { cannotDisable: true }),
      p('a', { depends: ['core'] }),
      p('b', { depends: ['a', 'core'] }),
    ];
    const { ordered } = resolvePlugins(plugins, ['b']);
    const idx = (id) => ordered.findIndex((x) => x.id === id);
    expect(idx('core')).toBeLessThan(idx('a'));
    expect(idx('a')).toBeLessThan(idx('b'));
  });
});

describe('resolvePlugins — transitive auto-enable', () => {
  it('pulls in transitive dependencies and reports them as autoEnabled', () => {
    const plugins = [
      p('core', { cannotDisable: true }),
      p('lib', { depends: ['core'] }),
      p('ads', { depends: ['lib'] }),
    ];
    const { ordered, autoEnabled } = resolvePlugins(plugins, ['ads']);
    expect(new Set(ordered.map((x) => x.id))).toEqual(
      new Set(['core', 'lib', 'ads']),
    );
    // core is cannotDisable so not "autoEnabled"; lib was pulled in.
    expect(autoEnabled).toEqual(['lib']);
  });

  it('does not list cannotDisable plugins as autoEnabled even if user did not select them', () => {
    const plugins = [p('core', { cannotDisable: true }), p('seo')];
    const { autoEnabled } = resolvePlugins(plugins, ['seo']);
    expect(autoEnabled).not.toContain('core');
  });
});

describe('resolvePlugins — error paths', () => {
  it('throws when a dependency is missing', () => {
    const plugins = [p('a', { depends: ['nonexistent'] })];
    expect(() => resolvePlugins(plugins, ['a'])).toThrow(
      /depends on unknown plugin "nonexistent"/,
    );
  });

  it('throws on a direct self-cycle (a -> a)', () => {
    const plugins = [p('a', { depends: ['a'] })];
    expect(() => resolvePlugins(plugins, ['a'])).toThrow(
      /Plugin dependency cycle detected: a -> a/,
    );
  });

  it('throws on an indirect cycle (a -> b -> a) with the full path', () => {
    const plugins = [p('a', { depends: ['b'] }), p('b', { depends: ['a'] })];
    expect(() => resolvePlugins(plugins, ['a'])).toThrow(
      /Plugin dependency cycle detected: a -> b -> a/,
    );
  });

  it('throws on a 3-node cycle (a -> b -> c -> a)', () => {
    const plugins = [
      p('a', { depends: ['b'] }),
      p('b', { depends: ['c'] }),
      p('c', { depends: ['a'] }),
    ];
    expect(() => resolvePlugins(plugins, ['a'])).toThrow(/a -> b -> c -> a/);
  });

  it('throws when a depends entry is not a string', () => {
    const plugins = [{ ...p('a'), depends: [42] }];
    expect(() => resolvePlugins(plugins, ['a'])).toThrow(
      /invalid entry in 'depends'/,
    );
  });

  it('throws when userSelected references an unknown plugin id', () => {
    const plugins = [p('core', { cannotDisable: true }), p('seo')];
    expect(() => resolvePlugins(plugins, ['typo'])).toThrow(
      /User-selected plugin "typo" was not discovered/,
    );
  });

  it('lists the available plugins in the unknown-id error', () => {
    const plugins = [p('core', { cannotDisable: true }), p('seo'), p('ads')];
    expect(() => resolvePlugins(plugins, ['oops'])).toThrow(
      /Available: ads, core, seo/,
    );
  });
});

describe('resolvePlugins — non-trivial topology', () => {
  it('handles a diamond dependency (D depends on B and C, both depend on A)', () => {
    const plugins = [
      p('A', { cannotDisable: true }),
      p('B', { depends: ['A'] }),
      p('C', { depends: ['A'] }),
      p('D', { depends: ['B', 'C'] }),
    ];
    const { ordered } = resolvePlugins(plugins, ['D']);
    const ids = ordered.map((x) => x.id);
    expect(ids).toContain('A');
    expect(ids).toContain('B');
    expect(ids).toContain('C');
    expect(ids).toContain('D');
    // A appears before B and C; both before D.
    expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('B'));
    expect(ids.indexOf('A')).toBeLessThan(ids.indexOf('C'));
    expect(ids.indexOf('B')).toBeLessThan(ids.indexOf('D'));
    expect(ids.indexOf('C')).toBeLessThan(ids.indexOf('D'));
  });
});
