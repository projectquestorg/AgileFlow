import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyChanges,
  classifyEntry,
  createContext,
  globalScope,
  projectScope,
  writeTree,
  type ProviderContext,
  type ResolvedSkill,
  type ScopeTarget,
} from '@agileflow/core';
import { claudeAdapter } from '@agileflow/providers';

const tmp: string[] = [];
function tmpdir(): string {
  const d = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'af-links-')));
  tmp.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

const SKILL = Buffer.from('---\nname: demo\ndescription: Demo skill.\n---\nBody\n');

async function canonical(scope: ScopeTarget, id = 'demo'): Promise<ResolvedSkill> {
  const dir = path.join(scope.skillsDir, id);
  await writeTree(dir, [{ path: 'SKILL.md', content: SKILL, executable: false }]);
  return { id, dir, activation: 'auto' };
}

async function expose(pctx: ProviderContext, skills: ResolvedSkill[]) {
  const plan =
    pctx.scope.kind === 'project'
      ? await claudeAdapter.planProjectSkillExposure(pctx, skills)
      : await claudeAdapter.planUserSkillExposure(pctx, skills);
  const results = await applyChanges(plan, { root: pctx.scope.root, env: pctx.ctx.env, platform: pctx.ctx.platform });
  return { plan, results };
}

describe('Claude links when .claude or ~/.claude is itself a symlink', () => {
  it('project: .claude -> a shared directory elsewhere', async () => {
    const root = tmpdir();
    const shared = tmpdir();
    fs.mkdirSync(path.join(shared, 'claude'));
    fs.symlinkSync(path.join(shared, 'claude'), path.join(root, '.claude'));
    const scope = projectScope(root);
    const skill = await canonical(scope);
    const pctx = { ctx: createContext({ cwd: root, homeDir: tmpdir(), env: { PATH: '' } }), scope, settings: undefined };

    const { results } = await expose(pctx, [skill]);
    expect(results.map((r) => r.outcome)).toEqual(['done']);
    const entry = path.join(root, '.claude/skills/demo');
    expect(fs.readFileSync(path.join(entry, 'SKILL.md'), 'utf8')).toContain('Demo skill.');
    expect((await classifyEntry(entry, skill.dir)).state).toBe('linked');
    const diags = await claudeAdapter.validate(pctx, [skill]);
    expect(diags.find((d) => d.level === 'error')).toBeUndefined();
    expect(diags.map((d) => d.message)).toContain('Claude compatibility links valid');
    // Idempotent: nothing left to do.
    expect(await claudeAdapter.planProjectSkillExposure(pctx, [skill])).toEqual([]);
  });

  it('global: ~/.claude -> ~/dotfiles/claude, and repairs links the old relative computation broke', async () => {
    const home = tmpdir();
    fs.mkdirSync(path.join(home, 'dotfiles/claude/skills'), { recursive: true });
    fs.symlinkSync('dotfiles/claude', path.join(home, '.claude'));
    const ctx = createContext({ cwd: home, homeDir: home, configDir: path.join(home, '.config/agileflow'), env: { PATH: '' } });
    const scope = globalScope(ctx);
    const skill = await canonical(scope);
    // What earlier versions wrote: relative to the lexical ~/.claude/skills,
    // which resolves to ~/dotfiles/.agents/skills/demo (does not exist).
    fs.symlinkSync('../../.agents/skills/demo', path.join(home, 'dotfiles/claude/skills/demo'));
    const entry = path.join(home, '.claude/skills/demo');
    expect(fs.existsSync(path.join(entry, 'SKILL.md'))).toBe(false);
    expect(await classifyEntry(entry, skill.dir)).toMatchObject({ state: 'dangling-ours' });

    const pctx = { ctx, scope, settings: undefined };
    const { plan } = await expose(pctx, [skill]);
    expect(plan).toMatchObject([{ kind: 'link', skillId: 'demo' }]);
    expect(fs.readFileSync(path.join(entry, 'SKILL.md'), 'utf8')).toContain('Demo skill.');
    expect((await classifyEntry(entry, skill.dir)).state).toBe('linked');

    // Removal still finds it.
    expect(await claudeAdapter.removeManagedArtifacts(pctx, ['demo'])).toMatchObject([{ kind: 'remove', skillId: 'demo' }]);
  });

  it('keeps the plain portable relative target when nothing is symlinked', async () => {
    const root = tmpdir();
    const scope = projectScope(root);
    const skill = await canonical(scope);
    await expose({ ctx: createContext({ cwd: root, homeDir: tmpdir(), env: { PATH: '' } }), scope, settings: undefined }, [skill]);
    expect(fs.readlinkSync(path.join(root, '.claude/skills/demo'))).toBe('../../.agents/skills/demo');
  });
});

describe('CLAUDE_CONFIG_DIR', () => {
  it('global links go to $CLAUDE_CONFIG_DIR/skills, the directory Claude reads', async () => {
    const home = tmpdir();
    const configDir = path.join(home, '.config/claude');
    fs.mkdirSync(configDir, { recursive: true });
    const ctx = createContext({ cwd: home, homeDir: home, configDir: path.join(home, '.config/agileflow'), env: { PATH: '', CLAUDE_CONFIG_DIR: configDir } });
    const scope = globalScope(ctx);
    const skill = await canonical(scope);
    const pctx = { ctx, scope, settings: undefined };
    expect((await claudeAdapter.detect(pctx)).evidence).toEqual(['$CLAUDE_CONFIG_DIR exists']);
    expect((await claudeAdapter.inspect(pctx)).skillLocations).toEqual(['~/.config/claude/skills']);
    await expose(pctx, [skill]);
    expect(fs.existsSync(path.join(configDir, 'skills/demo/SKILL.md'))).toBe(true);
    expect(fs.existsSync(path.join(home, '.claude'))).toBe(false);
    // Project scope is unaffected.
    const project = projectScope(tmpdir());
    expect((await claudeAdapter.inspect({ ctx, scope: project, settings: undefined })).skillLocations).toEqual(['.claude/skills']);
  });
});

describe('Windows link artifacts', () => {
  it('a junction left pointing at a moved project is ours (stale) and gets replaced and removed', async () => {
    const root = tmpdir();
    const scope = projectScope(root);
    const skill = await canonical(scope);
    const entry = path.join(root, '.claude/skills/demo');
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    // Junctions store absolute targets; the project used to live elsewhere.
    fs.symlinkSync('C:\\Old\\Proj\\.Agents\\Skills\\demo', entry);
    expect(await classifyEntry(entry, skill.dir, { platform: 'win32' })).toEqual({ state: 'dangling-ours', stale: true });
    // Case and separators are Windows rules only.
    expect((await classifyEntry(entry, skill.dir, { platform: 'linux' })).state).toBe('foreign-link');

    const ctx = createContext({ cwd: root, homeDir: tmpdir(), env: { PATH: '' }, platform: 'win32' });
    const pctx = { ctx, scope, settings: undefined };
    expect(await claudeAdapter.removeManagedArtifacts(pctx, ['demo'])).toMatchObject([{ kind: 'remove', reason: 'AgileFlow link' }]);
    expect(await claudeAdapter.planProjectSkillExposure(pctx, [skill])).toMatchObject([{ kind: 'link', skillId: 'demo' }]);
  });

  it('dangling links to anything other than .agents/skills/<same id> stay foreign', async () => {
    const root = tmpdir();
    const scope = projectScope(root);
    const skill = await canonical(scope);
    const dir = path.join(root, '.claude/skills');
    fs.mkdirSync(dir, { recursive: true });
    fs.symlinkSync('/nowhere/my-skills/demo', path.join(dir, 'demo'));
    expect((await classifyEntry(path.join(dir, 'demo'), skill.dir)).state).toBe('foreign-link');
    fs.unlinkSync(path.join(dir, 'demo'));
    fs.symlinkSync('/old/proj/.agents/skills/other', path.join(dir, 'demo'));
    expect((await classifyEntry(path.join(dir, 'demo'), skill.dir)).state).toBe('foreign-link');
    // A link cycle does not crash classification.
    fs.unlinkSync(path.join(dir, 'demo'));
    fs.symlinkSync('demo', path.join(dir, 'demo'));
    expect((await classifyEntry(path.join(dir, 'demo'), skill.dir)).state).toBe('foreign-link');
  });

  it('a committed symlink checked out as a text file (core.symlinks=false) is repaired', async () => {
    const root = tmpdir();
    const scope = projectScope(root);
    const skill = await canonical(scope);
    const entry = path.join(root, '.claude/skills/demo');
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    fs.writeFileSync(entry, '../../.agents/skills/demo');
    expect(await classifyEntry(entry, skill.dir)).toEqual({ state: 'git-placeholder', target: '../../.agents/skills/demo' });

    const pctx = { ctx: createContext({ cwd: root, homeDir: tmpdir(), env: { PATH: '' } }), scope, settings: undefined };
    expect((await claudeAdapter.validate(pctx, [skill])).find((d) => d.level === 'error')?.message).toBe(
      'Claude compatibility links missing',
    );
    const { plan, results } = await expose(pctx, [skill]);
    expect(plan.map((c) => c.kind)).toEqual(['remove', 'link', 'warn']);
    expect(plan[2]).toMatchObject({ message: expect.stringContaining('core.symlinks=false') });
    expect(results.filter((r) => r.outcome === 'done')).toHaveLength(2);
    expect(fs.lstatSync(entry).isSymbolicLink()).toBe(true);
    expect((await classifyEntry(entry, skill.dir)).state).toBe('linked');
  });

  it('any other file is left alone and reported as a file, not a skill', async () => {
    const root = tmpdir();
    const scope = projectScope(root);
    const skill = await canonical(scope);
    const entry = path.join(root, '.claude/skills/demo');
    fs.mkdirSync(path.dirname(entry), { recursive: true });
    fs.writeFileSync(entry, 'my notes\n');
    const pctx = { ctx: createContext({ cwd: root, homeDir: tmpdir(), env: { PATH: '' } }), scope, settings: undefined };
    const plan = await claudeAdapter.planProjectSkillExposure(pctx, [skill]);
    expect(plan).toMatchObject([{ kind: 'warn', message: expect.stringContaining('already exists as a file') }]);
    const shadow = (await claudeAdapter.validate(pctx, [skill])).find((d) => d.message === 'Claude skills shadow AgileFlow skills');
    expect(shadow?.detail).toEqual(['.claude/skills/demo: a file with the same name']);
    expect(await claudeAdapter.removeManagedArtifacts(pctx, ['demo'])).toEqual([]);
    expect(fs.readFileSync(entry, 'utf8')).toBe('my notes\n');
  });
});

describe('applying links never replaces what appeared after planning', () => {
  it('does not fall back to a mirror over an entry that now exists, and keeps live links', async () => {
    const root = tmpdir();
    const scope = projectScope(root);
    const skill = await canonical(scope);
    const entry = path.join(root, '.claude/skills/demo');
    const change = { kind: 'link' as const, provider: 'claude', skillId: 'demo', path: entry, target: skill.dir };
    await writeTree(entry, [{ path: 'SKILL.md', content: Buffer.from('mine'), executable: false }]);
    const [dirResult] = await applyChanges([change], { root, env: {}, platform: 'linux' });
    expect(dirResult!.outcome).toBe('failed');
    expect(fs.readFileSync(path.join(entry, 'SKILL.md'), 'utf8')).toBe('mine');
    expect(fs.existsSync(path.join(entry, '.agileflow-mirror.json'))).toBe(false);

    fs.rmSync(entry, { recursive: true });
    const elsewhere = tmpdir();
    fs.symlinkSync(elsewhere, entry);
    const [linkResult] = await applyChanges([change], { root, env: {}, platform: 'linux' });
    expect(linkResult!.outcome).toBe('failed');
    expect(fs.readlinkSync(entry)).toBe(elsewhere);
  });
});
