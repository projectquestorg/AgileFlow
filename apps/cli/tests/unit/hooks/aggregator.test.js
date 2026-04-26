/**
 * Unit tests for the hook manifest aggregator.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import yaml from 'js-yaml';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import aggregatorModule from '../../../src/runtime/hooks/aggregator.js';

const {
  buildHookManifest,
  writeAggregatedManifest,
  removeAggregatedManifest,
  HEADER_COMMENT,
} = aggregatorModule;

/**
 * @param {string} id
 * @param {object[]} [hooks]
 */
function plugin(id, hooks = []) {
  return {
    id,
    name: id,
    description: `${id} plugin`,
    version: '1.0.0',
    enabledByDefault: false,
    cannotDisable: false,
    depends: [],
    provides: { commands: [], skills: [], agents: [], hooks, templates: [] },
    dir: `/fake/${id}`,
  };
}

describe('buildHookManifest', () => {
  it('returns an empty manifest when no plugin contributes hooks', () => {
    const m = buildHookManifest([plugin('a'), plugin('b')]);
    expect(m).toEqual({ version: 1, hooks: [] });
  });

  it('rewrites script paths to be project-root-relative', () => {
    const m = buildHookManifest([
      plugin('core', [
        {
          id: 'welcome',
          event: 'SessionStart',
          script: 'hooks/welcome.js',
          timeout: 5000,
          skipOnError: true,
        },
      ]),
    ]);
    expect(m.hooks).toHaveLength(1);
    expect(m.hooks[0].script).toBe('.agileflow/plugins/core/hooks/welcome.js');
    expect(m.hooks[0].timeout).toBe(5000);
    expect(m.hooks[0].skipOnError).toBe(true);
  });

  it('preserves matcher when present', () => {
    const m = buildHookManifest([
      plugin('audit', [
        {
          id: 'damage-control-bash',
          event: 'PreToolUse',
          matcher: 'Bash',
          script: 'hooks/damage-control-bash.js',
        },
      ]),
    ]);
    expect(m.hooks[0].matcher).toBe('Bash');
  });

  it('skips invalid entries silently (defensive)', () => {
    const m = buildHookManifest([
      plugin('weird', [
        null,
        'not an object',
        { id: 'noscript', event: 'Stop' }, // missing script
        { script: 'a.js', event: 'Stop' }, // missing id
        { id: 'good', event: 'Stop', script: 'hooks/good.js' },
      ]),
    ]);
    expect(m.hooks).toHaveLength(1);
    expect(m.hooks[0].id).toBe('good');
  });

  it('aggregates across multiple plugins in topological order', () => {
    const m = buildHookManifest([
      plugin('core', [{ id: 'core-welcome', event: 'SessionStart', script: 'hooks/welcome.js' }]),
      plugin('seo', [{ id: 'seo-init', event: 'SessionStart', script: 'hooks/init.js' }]),
    ]);
    expect(m.hooks.map((h) => h.id)).toEqual(['core-welcome', 'seo-init']);
    expect(m.hooks[1].script).toBe('.agileflow/plugins/seo/hooks/init.js');
  });
});

describe('writeAggregatedManifest', () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-aggr-'));
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it('writes a YAML file with the auto-generated header comment and parses round-trip', async () => {
    const out = await writeAggregatedManifest(
      [plugin('core', [{ id: 'welcome', event: 'SessionStart', script: 'hooks/welcome.js' }])],
      scratch,
    );
    expect(out).toBe(path.join(scratch, 'hook-manifest.yaml'));
    const text = fs.readFileSync(out, 'utf8');
    expect(text.startsWith('# Auto-generated')).toBe(true);
    const parsed = yaml.load(text);
    expect(parsed.version).toBe(1);
    expect(parsed.hooks[0].script).toBe('.agileflow/plugins/core/hooks/welcome.js');
  });

  it('cleans up the temp file on success', async () => {
    await writeAggregatedManifest([plugin('a')], scratch);
    const siblings = fs.readdirSync(scratch);
    expect(siblings.filter((s) => s.startsWith('.hook-manifest.yaml.tmp-'))).toEqual([]);
    expect(siblings).toContain('hook-manifest.yaml');
  });

  it('cleans up the temp file when rename fails (dest is a directory)', async () => {
    fs.mkdirSync(path.join(scratch, 'hook-manifest.yaml'));
    await expect(
      writeAggregatedManifest([plugin('a')], scratch),
    ).rejects.toThrow();
    const siblings = fs.readdirSync(scratch);
    expect(siblings.filter((s) => s.startsWith('.hook-manifest.yaml.tmp-'))).toEqual([]);
  });

  it('header comment is constant and identifiable', () => {
    expect(HEADER_COMMENT).toMatch(/Auto-generated/);
    expect(HEADER_COMMENT).toMatch(/Do not edit by hand/);
  });
});

describe('removeAggregatedManifest', () => {
  /** @type {string} */
  let scratch;

  beforeEach(() => {
    scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-aggr-'));
  });

  afterEach(() => {
    fs.rmSync(scratch, { recursive: true, force: true });
  });

  it('removes an existing manifest and returns true', async () => {
    fs.writeFileSync(path.join(scratch, 'hook-manifest.yaml'), 'x');
    expect(await removeAggregatedManifest(scratch)).toBe(true);
    expect(fs.existsSync(path.join(scratch, 'hook-manifest.yaml'))).toBe(false);
  });

  it('returns false when the manifest is absent (no error)', async () => {
    expect(await removeAggregatedManifest(scratch)).toBe(false);
  });
});
