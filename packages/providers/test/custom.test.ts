import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyChanges, createContext, globalScope, projectScope, writeTree, type ResolvedSkill, type ScopeTarget } from '@agileflow/core';
import { allAdapters, mergeProviderSettings, skillsDirProblem } from '@agileflow/providers';

const tmp: string[] = [];
function tmpdir(): string {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'af-custom-'));
  tmp.push(d);
  return d;
}
afterEach(() => {
  for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

async function skill(scope: ScopeTarget, id: string, activation: 'auto' | 'manual' = 'auto'): Promise<ResolvedSkill> {
  const dir = path.join(scope.skillsDir, id);
  await writeTree(dir, [{ path: 'SKILL.md', content: Buffer.from(`---\nname: ${id}\ndescription: x\n---\n`), executable: false }]);
  return { id, dir, activation };
}

describe('custom link providers from config', () => {
  it('links skills into skillsDir like Claude, owning only its links', async () => {
    const root = tmpdir();
    const scope = projectScope(root);
    const settings = { windsurf: { skillsDir: '.windsurf/skills', displayName: 'Windsurf' } };
    const adapters = allAdapters(settings);
    expect(adapters.map((a) => a.id)).toEqual(['codex', 'claude', 'cursor', 'opencode', 'gemini', 'windsurf']);
    const windsurf = adapters.find((a) => a.id === 'windsurf')!;
    expect(windsurf).toMatchObject({ displayName: 'Windsurf', support: 'experimental' });
    const pctx = { ctx: createContext({ cwd: root, homeDir: tmpdir(), env: { PATH: '' } }), scope, settings: settings.windsurf };
    expect(await windsurf.detect(pctx)).toEqual({ detected: true, evidence: ['configured in agileflow.yaml'] });

    const skills = [await skill(scope, 'alpha'), await skill(scope, 'beta', 'manual')];
    await writeTree(path.join(root, '.windsurf/skills/mine'), [{ path: 'SKILL.md', content: Buffer.from('mine'), executable: false }]);
    const plan = await windsurf.planProjectSkillExposure(pctx, skills);
    expect(plan.map((c) => [c.kind, c.provider])).toEqual([
      ['link', 'windsurf'],
      ['link', 'windsurf'],
    ]);
    await applyChanges(plan, { root, env: {}, platform: process.platform });
    expect(fs.readlinkSync(path.join(root, '.windsurf/skills/alpha'))).toBe('../../.agents/skills/alpha');

    const diags = await windsurf.validate(pctx, skills);
    expect(diags.map((d) => d.message)).toEqual(
      expect.arrayContaining(['Windsurf compatibility links valid', 'Windsurf manual-only enforcement: semantic']),
    );
    expect(await windsurf.inspect(pctx)).toMatchObject({ skillLocations: ['.windsurf/skills'], exposure: 'linked', manualInvocation: 'semantic' });
    // Custom providers write nothing into the canonical skill.
    expect(windsurf.applyManualActivation).toBeUndefined();

    const removal = await windsurf.removeManagedArtifacts(pctx, ['alpha', 'beta', 'mine']);
    expect(removal.map((c) => c.kind === 'remove' && c.skillId)).toEqual(['alpha', 'beta']);
  });

  it('uses userSkillsDir (home-relative) for personal skills, and nothing when a scope has no directory', async () => {
    const home = tmpdir();
    const ctx = createContext({ cwd: home, homeDir: home, configDir: path.join(home, '.config/agileflow'), env: { PATH: '' } });
    const settings = { tool: { userSkillsDir: '.tool/skills' } };
    const tool = allAdapters(settings).find((a) => a.id === 'tool')!;
    const scope = globalScope(ctx);
    const pctx = { ctx, scope, settings: settings.tool };
    const s = await skill(scope, 'alpha');
    const plan = await tool.planUserSkillExposure(pctx, [s]);
    expect(plan).toMatchObject([{ kind: 'link', path: path.join(home, '.tool/skills/alpha') }]);
    expect((await tool.inspect(pctx)).skillLocations).toEqual(['~/.tool/skills']);

    const project = { ctx, scope: projectScope(tmpdir()), settings: settings.tool };
    expect(await tool.planProjectSkillExposure(project, [s])).toEqual([]);
    expect(await tool.validate(project, [s])).toEqual([
      { level: 'info', message: 'tool: no skillsDir configured; project skills are not linked' },
    ]);
  });

  it('a provider only in the personal config is active in a project where its folder exists', async () => {
    const root = tmpdir();
    const tool = allAdapters({ windsurf: { skillsDir: '.windsurf/skills' } }).find((a) => a.id === 'windsurf')!;
    const pctx = { ctx: createContext({ cwd: root, homeDir: tmpdir(), env: { PATH: '' } }), scope: projectScope(root), settings: undefined };
    expect((await tool.detect(pctx)).detected).toBe(false);
    fs.mkdirSync(path.join(root, '.windsurf'));
    expect(await tool.detect(pctx)).toEqual({ detected: true, evidence: ['.windsurf in project'] });
  });

  it('rejects unsafe or pointless directories', () => {
    for (const bad of ['../x', 'a/../../x', '/abs/skills', 'C:\\skills', '~/skills', '.', '', '.agents/skills', '.agents/skills/', '.Agents/Skills/sub', '.claude/skills']) {
      expect(skillsDirProblem(bad), bad).not.toBeNull();
    }
    for (const ok of ['.windsurf/skills', 'tools/agent/skills/', '.agents/other', 'skills']) {
      expect(skillsDirProblem(ok), ok).toBeNull();
    }
  });

  it('reports invalid settings in check and links nothing', async () => {
    const root = tmpdir();
    const scope = projectScope(root);
    const s = await skill(scope, 'alpha');
    const settings = { evil: { skillsDir: '../outside' }, Bad_Id: { skillsDir: 'x/skills' } };
    const adapters = allAdapters(settings);
    const ctx = createContext({ cwd: root, homeDir: tmpdir(), env: { PATH: '' } });
    for (const id of ['evil', 'Bad_Id'] as const) {
      const adapter = adapters.find((a) => a.id === id)!;
      const pctx = { ctx, scope, settings: settings[id] };
      expect(await adapter.planProjectSkillExposure(pctx, [s])).toEqual([]);
      expect(await adapter.removeManagedArtifacts(pctx, ['alpha'])).toEqual([]);
      const diags = await adapter.validate(pctx, [s]);
      expect(diags.every((d) => d.level === 'error')).toBe(true);
    }
    expect((await adapters.find((a) => a.id === 'evil')!.validate({ ctx, scope, settings: settings.evil }, [s]))[0]!.message).toBe(
      'providers.evil.skillsDir must not contain `..`',
    );
  });

  it('built-in ids reject skillsDir/userSkillsDir; unknown ids without a directory get a warning', async () => {
    const root = tmpdir();
    const ctx = createContext({ cwd: root, homeDir: tmpdir(), env: { PATH: '' } });
    const scope = projectScope(root);
    const adapters = allAdapters({ claude: { skillsDir: '.x/skills' }, claud: { enabled: true } });
    const claude = adapters.find((a) => a.id === 'claude')!;
    const diags = await claude.validate({ ctx, scope, settings: { skillsDir: '.x/skills' } }, []);
    expect(diags[0]).toMatchObject({ level: 'error', message: 'providers.claude.skillsDir is not supported: claude is a built-in provider' });

    const typo = adapters.find((a) => a.id === 'claud')!;
    const pctx = { ctx, scope, settings: { enabled: true as const } };
    expect((await typo.detect(pctx)).detected).toBe(true);
    expect(await typo.planProjectSkillExposure(pctx, [])).toEqual([]);
    const warn = await typo.validate(pctx, []);
    expect(warn).toHaveLength(1);
    expect(warn[0]).toMatchObject({ level: 'warn', message: 'providers.claud is not a built-in provider and has no skillsDir; nothing is linked for it' });
  });

  it('merges personal and project provider settings per field, project winning', () => {
    expect(
      mergeProviderSettings(
        { windsurf: { skillsDir: '.windsurf/skills', userSkillsDir: '.codeium/windsurf/skills' }, claude: { enabled: false } },
        { windsurf: { enabled: false }, codex: { enabled: true } },
      ),
    ).toEqual({
      windsurf: { skillsDir: '.windsurf/skills', userSkillsDir: '.codeium/windsurf/skills', enabled: false },
      claude: { enabled: false },
      codex: { enabled: true },
    });
    expect(allAdapters().map((a) => a.id)).toEqual(['codex', 'claude', 'cursor', 'opencode', 'gemini']);
  });
});
