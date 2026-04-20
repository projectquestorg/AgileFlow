/**
 * Unit tests for the plugin registry.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import registry from '../../../src/runtime/plugins/registry.js';

const { discoverPlugins, loadPlugin, getPlugin, PLUGINS_DIR } = registry;

describe('plugin registry (bundled content)', () => {
  it('discovers all 5 stub plugins', () => {
    const plugins = discoverPlugins();
    expect(plugins.map((p) => p.id).sort()).toEqual([
      'ads',
      'audit',
      'core',
      'council',
      'seo',
    ]);
  });

  it('places cannotDisable plugins first', () => {
    const plugins = discoverPlugins();
    expect(plugins[0].id).toBe('core');
    expect(plugins[0].cannotDisable).toBe(true);
    // All others: cannotDisable === false
    for (const p of plugins.slice(1)) {
      expect(p.cannotDisable).toBe(false);
    }
  });

  it('resolves a plugin by id', () => {
    expect(getPlugin('seo').name).toBe('SEO');
    expect(getPlugin('nonexistent')).toBeNull();
  });

  it('exposes PLUGINS_DIR as an absolute path to content/plugins', () => {
    expect(path.isAbsolute(PLUGINS_DIR)).toBe(true);
    expect(PLUGINS_DIR.endsWith(path.join('content', 'plugins'))).toBe(true);
  });

  it('assigns provides defaults when the key is absent', () => {
    const core = getPlugin('core');
    expect(core.provides).toBeDefined();
    expect(Array.isArray(core.provides.commands)).toBe(true);
  });
});

describe('loadPlugin (error paths)', () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-registry-'));
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it('throws when plugin.yaml is missing', () => {
    expect(() => loadPlugin(scratch)).toThrow(/Missing plugin.yaml/);
  });

  it('throws with required-field report when fields are missing', () => {
    fs.writeFileSync(
      path.join(scratch, 'plugin.yaml'),
      'id: broken\nname: Broken\n',
    );
    expect(() => loadPlugin(scratch)).toThrow(/missing required fields/);
  });

  it('throws on malformed YAML', () => {
    fs.writeFileSync(path.join(scratch, 'plugin.yaml'), 'id: [unclosed');
    expect(() => loadPlugin(scratch)).toThrow(/Invalid YAML/);
  });

  it('throws when YAML parses to non-object', () => {
    fs.writeFileSync(path.join(scratch, 'plugin.yaml'), 'null');
    expect(() => loadPlugin(scratch)).toThrow(/Empty or non-object/);
  });

  it('throws when depends is a string (common authoring mistake)', () => {
    fs.writeFileSync(
      path.join(scratch, 'plugin.yaml'),
      'id: ok\nname: Ok\ndescription: test\nversion: 1.0.0\ndepends: core\n',
    );
    expect(() => loadPlugin(scratch)).toThrow(
      /'depends' must be an array/,
    );
  });

  it('accepts depends when omitted (defaults to empty array)', () => {
    fs.writeFileSync(
      path.join(scratch, 'plugin.yaml'),
      'id: ok\nname: Ok\ndescription: test\nversion: 1.0.0\n',
    );
    expect(loadPlugin(scratch).depends).toEqual([]);
  });

  it('accepts depends as an array', () => {
    fs.writeFileSync(
      path.join(scratch, 'plugin.yaml'),
      'id: ok\nname: Ok\ndescription: test\nversion: 1.0.0\ndepends:\n  - core\n  - seo\n',
    );
    expect(loadPlugin(scratch).depends).toEqual(['core', 'seo']);
  });
});

describe('discoverPlugins (custom root, duplicate detection)', () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-dup-'));
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it('returns [] for a root that does not exist', () => {
    expect(discoverPlugins(path.join(scratch, 'no-such-dir'))).toEqual([]);
  });

  it('throws on duplicate plugin ids across sibling dirs', () => {
    for (const name of ['a', 'b']) {
      const dir = path.join(scratch, name);
      fs.mkdirSync(dir);
      fs.writeFileSync(
        path.join(dir, 'plugin.yaml'),
        'id: same\nname: Same\ndescription: dup\nversion: 1.0.0\n',
      );
    }
    expect(() => discoverPlugins(scratch)).toThrow(/Duplicate plugin id/);
  });
});
