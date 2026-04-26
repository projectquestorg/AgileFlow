/**
 * Unit tests for the Claude Code skill mirror.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

import skillsModule from '../../../src/runtime/ide/claude-code-skills.js';

const { mirrorClaudeCodeSkills, unmirrorClaudeCodeSkills, collectPluginSkills } = skillsModule;

/**
 * Build a fake plugin on disk under scratch and return a manifest
 * shaped like what discoverPlugins would produce.
 *
 * @param {string} root
 * @param {string} pluginId
 * @param {Array<{ id: string, files?: Record<string,string> }>} skillSpecs
 */
function makePlugin(root, pluginId, skillSpecs) {
  const dir = path.join(root, pluginId);
  fs.mkdirSync(dir, { recursive: true });
  /** @type {Array<{id:string,dir:string}>} */
  const skills = [];
  for (const s of skillSpecs) {
    const skillDir = path.join(dir, 'skills', s.id);
    fs.mkdirSync(skillDir, { recursive: true });
    const files = s.files || { 'SKILL.md': `# ${s.id}\n` };
    for (const [name, content] of Object.entries(files)) {
      const p = path.join(skillDir, name);
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, content);
    }
    skills.push({ id: s.id, dir: `skills/${s.id}` });
  }
  return {
    id: pluginId,
    name: pluginId,
    description: `${pluginId} plugin`,
    version: '1.0.0',
    enabledByDefault: false,
    cannotDisable: false,
    depends: [],
    provides: { commands: [], skills, agents: [], hooks: [], templates: [] },
    dir,
  };
}

describe('collectPluginSkills', () => {
  /** @type {string} */
  let scratch;
  beforeEach(() => { scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-css-')); });
  afterEach(() => { fs.rmSync(scratch, { recursive: true, force: true }); });

  it('returns an empty list when no plugin contributes skills', () => {
    const p = makePlugin(scratch, 'nada', []);
    expect(collectPluginSkills([p])).toEqual([]);
  });

  it('collects every declared skill with its absolute source dir', () => {
    const p = makePlugin(scratch, 'core', [{ id: 'agileflow-story-writer' }]);
    const out = collectPluginSkills([p]);
    expect(out).toHaveLength(1);
    expect(out[0].skillId).toBe('agileflow-story-writer');
    expect(out[0].sourceDir).toBe(path.join(p.dir, 'skills', 'agileflow-story-writer'));
  });

  it('rejects skill specs with empty-string id or dir', () => {
    const p = makePlugin(scratch, 'core', []);
    // Inject malformed entries directly into the manifest after the
    // helper built valid skill dirs.
    p.provides.skills = [
      { id: '', dir: 'skills/x' },
      { id: 'ok', dir: '' },
      { id: 'real', dir: 'skills/real' },
    ];
    const out = collectPluginSkills([p]);
    expect(out.map((s) => s.skillId)).toEqual(['real']);
  });
});

describe('mirrorClaudeCodeSkills', () => {
  /** @type {string} */
  let scratch;
  beforeEach(() => { scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-css-')); });
  afterEach(() => { fs.rmSync(scratch, { recursive: true, force: true }); });

  it('copies skill content to .claude/skills/<id>/', async () => {
    const p = makePlugin(scratch, 'core', [
      { id: 'agileflow-story-writer', files: { 'SKILL.md': '# story\n', 'cookbook/x.md': 'cb' } },
    ]);
    const projectRoot = path.join(scratch, 'project');
    fs.mkdirSync(projectRoot, { recursive: true });

    const result = await mirrorClaudeCodeSkills([p], projectRoot);
    expect(result.mirrored).toEqual(['agileflow-story-writer']);

    const dest = path.join(projectRoot, '.claude/skills/agileflow-story-writer');
    expect(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf8')).toBe('# story\n');
    expect(fs.readFileSync(path.join(dest, 'cookbook/x.md'), 'utf8')).toBe('cb');
  });

  it('replaces a previously-mirrored skill (does not leave stale files)', async () => {
    const projectRoot = path.join(scratch, 'project');
    const dest = path.join(projectRoot, '.claude/skills/agileflow-story-writer');
    fs.mkdirSync(dest, { recursive: true });
    fs.writeFileSync(path.join(dest, 'stale.md'), 'should be removed');

    const p = makePlugin(scratch, 'core', [
      { id: 'agileflow-story-writer', files: { 'SKILL.md': '# fresh\n' } },
    ]);
    await mirrorClaudeCodeSkills([p], projectRoot);

    expect(fs.existsSync(path.join(dest, 'stale.md'))).toBe(false);
    expect(fs.readFileSync(path.join(dest, 'SKILL.md'), 'utf8')).toBe('# fresh\n');
  });

  it('prunes orphaned agileflow-* skills no longer in the enabled set', async () => {
    const projectRoot = path.join(scratch, 'project');
    fs.mkdirSync(path.join(projectRoot, '.claude/skills/agileflow-old'), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, '.claude/skills/agileflow-old/SKILL.md'),
      'orphan',
    );

    const p = makePlugin(scratch, 'core', [{ id: 'agileflow-story-writer' }]);
    const result = await mirrorClaudeCodeSkills([p], projectRoot);

    expect(result.pruned).toEqual(['agileflow-old']);
    expect(fs.existsSync(path.join(projectRoot, '.claude/skills/agileflow-old'))).toBe(false);
  });

  it('skips skills whose source dir is missing without crashing the install', async () => {
    const p = makePlugin(scratch, 'core', [{ id: 'agileflow-real' }]);
    // Add a phantom skill whose source dir does NOT exist on disk.
    p.provides.skills.push({ id: 'agileflow-phantom', dir: 'skills/agileflow-phantom' });
    const projectRoot = path.join(scratch, 'project');
    fs.mkdirSync(projectRoot, { recursive: true });

    const result = await mirrorClaudeCodeSkills([p], projectRoot);
    expect(result.mirrored).toEqual(['agileflow-real']);
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].skillId).toBe('agileflow-phantom');
    expect(result.skipped[0].error).toMatch(/source not found/);
    // The real skill landed; the phantom did not.
    expect(fs.existsSync(path.join(projectRoot, '.claude/skills/agileflow-real'))).toBe(true);
    expect(fs.existsSync(path.join(projectRoot, '.claude/skills/agileflow-phantom'))).toBe(false);
  });

  it('does NOT prune third-party skill dirs without the agileflow- prefix', async () => {
    const projectRoot = path.join(scratch, 'project');
    fs.mkdirSync(path.join(projectRoot, '.claude/skills/some-vendor-skill'), { recursive: true });
    fs.writeFileSync(
      path.join(projectRoot, '.claude/skills/some-vendor-skill/SKILL.md'),
      'third-party',
    );

    const p = makePlugin(scratch, 'core', []);
    const result = await mirrorClaudeCodeSkills([p], projectRoot);
    expect(result.pruned).toEqual([]);
    expect(
      fs.existsSync(path.join(projectRoot, '.claude/skills/some-vendor-skill')),
    ).toBe(true);
  });
});

describe('unmirrorClaudeCodeSkills', () => {
  /** @type {string} */
  let scratch;
  beforeEach(() => { scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'af-css-')); });
  afterEach(() => { fs.rmSync(scratch, { recursive: true, force: true }); });

  it('removes every agileflow-* skill dir and reports them', async () => {
    const projectRoot = path.join(scratch, 'project');
    fs.mkdirSync(path.join(projectRoot, '.claude/skills/agileflow-a'), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, '.claude/skills/agileflow-b'), { recursive: true });
    fs.mkdirSync(path.join(projectRoot, '.claude/skills/keep-me'), { recursive: true });

    const removed = await unmirrorClaudeCodeSkills(projectRoot);
    expect(removed.sort()).toEqual(['agileflow-a', 'agileflow-b']);
    expect(fs.existsSync(path.join(projectRoot, '.claude/skills/keep-me'))).toBe(true);
  });

  it('returns [] when .claude/skills/ does not exist', async () => {
    const projectRoot = path.join(scratch, 'project');
    fs.mkdirSync(projectRoot, { recursive: true });
    expect(await unmirrorClaudeCodeSkills(projectRoot)).toEqual([]);
  });
});
