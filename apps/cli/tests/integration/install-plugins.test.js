/**
 * End-to-end integration test for the v4 install pipeline.
 *
 * Wires: discoverPlugins → validatePluginSet → resolvePlugins →
 * walkFiles → syncFile → writeFileIndex. Targets the real bundled
 * stub plugins (core/ads/seo/audit/council) and asserts behavior in a
 * scratch project directory.
 *
 * Each top-level `it` is independent — fresh scratch dir per test.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import installModule from '../../src/runtime/installer/install.js';
import registryModule from '../../src/runtime/plugins/registry.js';

const { installPlugins } = installModule;
const { discoverPlugins } = registryModule;

describe('installPlugins integration', () => {
  /** @type {string} */
  let scratch;
  /** @type {string} */
  let agileflowDir;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-install-int-'));
    agileflowDir = path.join(scratch, '.agileflow');
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it('installs core + selected opt-ins from bundled stubs in topological order', async () => {
    const result = await installPlugins({
      discovered: discoverPlugins(),
      userSelected: ['seo', 'audit'],
      agileflowDir,
      cliVersion: '4.0.0-alpha.1',
    });

    // Order: core first (cannotDisable), then alphabetical for the rest.
    expect(result.ordered[0]).toBe('core');
    expect(new Set(result.ordered)).toEqual(new Set(['core', 'audit', 'seo']));
    expect(result.autoEnabled).toEqual([]);
    expect(result.removed).toEqual([]);

    // Each enabled plugin's plugin.yaml landed in the right place.
    for (const id of ['core', 'audit', 'seo']) {
      const yamlPath = path.join(agileflowDir, 'plugins', id, 'plugin.yaml');
      expect(fs.existsSync(yamlPath)).toBe(true);
      expect(fs.readFileSync(yamlPath, 'utf8')).toContain(`id: ${id}`);
    }

    // Disabled plugins did NOT install.
    expect(fs.existsSync(path.join(agileflowDir, 'plugins/ads'))).toBe(false);
    expect(fs.existsSync(path.join(agileflowDir, 'plugins/council'))).toBe(false);

    // File index was written and contains entries for every installed file.
    const idxPath = path.join(agileflowDir, '_cfg/files.json');
    expect(fs.existsSync(idxPath)).toBe(true);
    const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
    expect(idx.schema).toBe(1);
    expect(idx.version).toBe('4.0.0-alpha.1');
    // 3 plugin.yaml files at minimum (core, audit, seo).
    expect(Object.keys(idx.files).length).toBeGreaterThanOrEqual(3);
    expect(idx.files['plugins/core/plugin.yaml']).toBeDefined();
    expect(idx.files['plugins/audit/plugin.yaml']).toBeDefined();
    expect(idx.files['plugins/seo/plugin.yaml']).toBeDefined();

    // Counters reflect a fresh install.
    expect(result.ops.created).toBeGreaterThan(0);
    expect(result.ops.updated).toBe(0);
    expect(result.ops.preserved).toBe(0);
  });

  it('is idempotent: a second run reports zero writes and unchanged counters', async () => {
    const opts = {
      discovered: discoverPlugins(),
      userSelected: ['seo'],
      agileflowDir,
      cliVersion: '4.0.0-alpha.1',
    };

    const first = await installPlugins(opts);
    expect(first.ops.created).toBeGreaterThan(0);

    const second = await installPlugins(opts);
    expect(second.ops.created).toBe(0);
    expect(second.ops.updated).toBe(0);
    expect(second.ops.preserved).toBe(0);
    expect(second.ops.unchanged).toBeGreaterThan(0);
  });

  it('preserves user-modified files and stashes the upstream version', async () => {
    const opts = {
      discovered: discoverPlugins(),
      userSelected: ['seo'],
      agileflowDir,
      cliVersion: '4.0.0-alpha.1',
    };

    await installPlugins(opts);

    // Simulate the user editing seo's plugin.yaml.
    const userPath = path.join(agileflowDir, 'plugins/seo/plugin.yaml');
    fs.writeFileSync(userPath, 'id: seo\nname: My Custom SEO\nversion: 1.0.0\ndescription: edited\n');

    const result = await installPlugins(opts);

    // The user's edits are intact.
    expect(fs.readFileSync(userPath, 'utf8')).toContain('My Custom SEO');

    // A stash exists with the upstream content.
    const updatesRoot = path.join(agileflowDir, '_cfg/updates');
    expect(fs.existsSync(updatesRoot)).toBe(true);
    const stamps = fs.readdirSync(updatesRoot);
    expect(stamps.length).toBeGreaterThan(0);
    const stashedYaml = path.join(updatesRoot, stamps[0], 'plugins/seo/plugin.yaml');
    expect(fs.existsSync(stashedYaml)).toBe(true);
    expect(fs.readFileSync(stashedYaml, 'utf8')).toContain('description: Technical SEO');

    expect(result.ops.preserved).toBeGreaterThan(0);
    expect(result.ops.stashed).toBeGreaterThan(0);
    expect(result.ops.updatesPath).toBeTruthy();
  });

  it('removes plugin directories for plugins that are no longer enabled', async () => {
    // First install: seo + ads enabled.
    await installPlugins({
      discovered: discoverPlugins(),
      userSelected: ['seo', 'ads'],
      agileflowDir,
      cliVersion: '4.0.0-alpha.1',
    });
    expect(fs.existsSync(path.join(agileflowDir, 'plugins/seo'))).toBe(true);
    expect(fs.existsSync(path.join(agileflowDir, 'plugins/ads'))).toBe(true);

    // Second install: only seo. ads should be removed.
    const result = await installPlugins({
      discovered: discoverPlugins(),
      userSelected: ['seo'],
      agileflowDir,
      cliVersion: '4.0.0-alpha.1',
    });

    expect(result.removed).toEqual(['ads']);
    expect(fs.existsSync(path.join(agileflowDir, 'plugins/ads'))).toBe(false);
    expect(fs.existsSync(path.join(agileflowDir, 'plugins/seo'))).toBe(true);

    // Ads entries are pruned from the index.
    const idx = JSON.parse(
      fs.readFileSync(path.join(agileflowDir, '_cfg/files.json'), 'utf8'),
    );
    for (const key of Object.keys(idx.files)) {
      expect(key.startsWith('plugins/ads/')).toBe(false);
    }
  });

  it('preserves unknown directories under plugins/ (does not blast user-placed content)', async () => {
    await installPlugins({
      discovered: discoverPlugins(),
      userSelected: ['seo'],
      agileflowDir,
      cliVersion: '4.0.0-alpha.1',
    });
    // Pretend the user dropped a custom plugin directory.
    const customDir = path.join(agileflowDir, 'plugins', 'my-custom-plugin');
    fs.mkdirSync(customDir);
    fs.writeFileSync(path.join(customDir, 'note.txt'), 'mine');

    const result = await installPlugins({
      discovered: discoverPlugins(),
      userSelected: [],
      agileflowDir,
      cliVersion: '4.0.0-alpha.1',
    });

    // seo should be removed (no longer enabled), but my-custom-plugin survives.
    expect(result.removed).toEqual(['seo']);
    expect(fs.existsSync(customDir)).toBe(true);
    expect(fs.readFileSync(path.join(customDir, 'note.txt'), 'utf8')).toBe('mine');
  });

  it('throws (without partial install) when plugin validation fails', async () => {
    const broken = [
      ...discoverPlugins(),
      {
        id: 'BadId', // uppercase — fails strict validator
        name: 'Bad',
        description: 'short',
        version: 'not-semver',
        enabledByDefault: false,
        cannotDisable: false,
        depends: [],
        provides: { commands: [], skills: [], agents: [], hooks: [], templates: [] },
        dir: '/fake',
      },
    ];
    await expect(
      installPlugins({
        discovered: broken,
        userSelected: [],
        agileflowDir,
        cliVersion: '4.0.0-alpha.1',
      }),
    ).rejects.toThrow(/Plugin validation failed/);
    // Nothing was written.
    expect(fs.existsSync(agileflowDir)).toBe(false);
  });

  it('persists the file index even when sync fails mid-loop (try/finally)', async () => {
    // Build a fake plugin set: one valid, one whose dir does not exist.
    const real = discoverPlugins().find((p) => p.id === 'core');
    const phantom = {
      id: 'phantom',
      name: 'Phantom',
      description: 'Plugin whose dir was deleted before install',
      version: '1.0.0',
      enabledByDefault: false,
      cannotDisable: false,
      depends: [],
      provides: { commands: [], skills: [], agents: [], hooks: [], templates: [] },
      dir: path.join(scratch, 'no-such-dir'),
    };
    await expect(
      installPlugins({
        discovered: [real, phantom],
        userSelected: ['phantom'],
        agileflowDir,
        cliVersion: '4.0.0-alpha.1',
      }),
    ).rejects.toThrow();

    // Despite the failure, the file index was persisted with whatever
    // got synced before the throw (at minimum, core's plugin.yaml).
    const idxPath = path.join(agileflowDir, '_cfg/files.json');
    expect(fs.existsSync(idxPath)).toBe(true);
    const idx = JSON.parse(fs.readFileSync(idxPath, 'utf8'));
    expect(idx.files['plugins/core/plugin.yaml']).toBeDefined();
  });

  it('aggregates plugin hooks into hook-manifest.yaml when ide=claude-code', async () => {
    const result = await installPlugins({
      discovered: discoverPlugins(),
      userSelected: ['seo'],
      agileflowDir,
      cliVersion: '4.0.0-alpha.1',
      ide: 'claude-code',
    });
    expect(result.hookManifestPath).toBe(path.join(agileflowDir, 'hook-manifest.yaml'));
    const text = fs.readFileSync(result.hookManifestPath, 'utf8');
    expect(text).toMatch(/^# Auto-generated/);
    // The bundled core plugin contributes one SessionStart hook.
    expect(text).toMatch(/id: session-welcome/);
    expect(text).toMatch(/script: \.agileflow\/plugins\/core\/hooks\/session-welcome\.js/);
  });

  it('does NOT write hook-manifest.yaml when the IDE has hooks disabled', async () => {
    const result = await installPlugins({
      discovered: discoverPlugins(),
      userSelected: ['seo'],
      agileflowDir,
      cliVersion: '4.0.0-alpha.1',
      ide: 'cursor',
    });
    expect(result.hookManifestPath).toBeNull();
    expect(fs.existsSync(path.join(agileflowDir, 'hook-manifest.yaml'))).toBe(false);
  });

  it('removes a stale hook-manifest.yaml when switching to a non-hook IDE', async () => {
    // First install with claude-code: manifest gets written.
    await installPlugins({
      discovered: discoverPlugins(),
      userSelected: ['seo'],
      agileflowDir,
      cliVersion: '4.0.0-alpha.1',
      ide: 'claude-code',
    });
    expect(fs.existsSync(path.join(agileflowDir, 'hook-manifest.yaml'))).toBe(true);

    // Re-install with cursor: stale manifest is removed.
    await installPlugins({
      discovered: discoverPlugins(),
      userSelected: ['seo'],
      agileflowDir,
      cliVersion: '4.0.0-alpha.1',
      ide: 'cursor',
    });
    expect(fs.existsSync(path.join(agileflowDir, 'hook-manifest.yaml'))).toBe(false);
  });

  it('throws on dependency cycles', async () => {
    // Build a fake plugin set with an a -> b -> a cycle.
    const a = {
      id: 'a',
      name: 'A',
      description: 'aaaaaaaaaaaaaaaaaaa',
      version: '1.0.0',
      enabledByDefault: false,
      cannotDisable: false,
      depends: ['b'],
      provides: {},
      dir: '/fake/a',
    };
    const b = { ...a, id: 'b', name: 'B', depends: ['a'], dir: '/fake/b' };
    await expect(
      installPlugins({
        discovered: [a, b],
        userSelected: ['a'],
        agileflowDir,
        cliVersion: '4.0.0-alpha.1',
      }),
    ).rejects.toThrow(/Plugin dependency cycle detected/);
  });
});
