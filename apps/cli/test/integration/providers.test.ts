import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { scriptedPrompter } from '../../src/ui/prompts';
import { createSandbox, exists, isSymlink, read, type Sandbox } from '../helpers';

let sb: Sandbox;
afterEach(() => sb?.cleanup());

function lockedIds(s: Sandbox): string[] {
  return Object.keys(YAML.parse(read(path.join(s.project, 'agileflow.lock'))).resolved);
}

function frontmatter(file: string): Record<string, unknown> {
  const m = /^---\n([\s\S]*?)\n---/.exec(read(file));
  return YAML.parse(m![1]!);
}

describe('manual invocation translation', () => {
  it('manual skills get Claude/Cursor and Codex flags; OpenCode and Gemini are reported as semantic', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    sb.installProvider('claude');
    sb.installProvider('codex');
    sb.installProvider('gemini');
    sb.installProvider('opencode');
    await sb.af(['init', '--skills', 'interviewing-requirements,diagnosing-bugs']);
    const dir = path.join(sb.project, '.agents/skills/interviewing-requirements');
    const fm = frontmatter(path.join(dir, 'SKILL.md'));
    expect(fm['disable-model-invocation']).toBe(true);
    // OpenCode has no manual-only switch; AgileFlow writes no OpenCode metadata.
    expect(fm.metadata).toBeUndefined();
    expect(YAML.parse(read(path.join(dir, 'agents/openai.yaml')))).toEqual({ policy: { allow_implicit_invocation: false } });
    const auto = frontmatter(path.join(sb.project, '.agents/skills/diagnosing-bugs/SKILL.md'));
    expect(auto['disable-model-invocation']).toBeUndefined();
    expect(exists(path.join(sb.project, '.agents/skills/diagnosing-bugs/agents'))).toBe(false);

    const check = await sb.af(['check']);
    expect(check.code).toBe(0);
    expect(check.stdout).toContain('Gemini manual-only enforcement: semantic');
    expect(check.stdout).toContain('OpenCode manual-only enforcement: semantic');
    expect(check.stdout).not.toContain('may invoke manual skills automatically');
  });

  it('configure switches activation both ways and re-renders only clean skills', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--yes']);
    const file = path.join(sb.project, '.agents/skills/reviewing-changes/SKILL.md');
    expect((await sb.af(['configure', 'skill', 'reviewing-changes', '--activation', 'manual'])).code).toBe(0);
    expect(frontmatter(file)['disable-model-invocation']).toBe(true);
    expect(YAML.parse(read(path.join(sb.project, 'agileflow.yaml'))).skills['reviewing-changes'].activation).toBe('manual');
    expect(YAML.parse(read(path.join(sb.project, 'agileflow.lock'))).resolved['reviewing-changes'].activation).toBe('manual');
    expect((await sb.af(['configure', 'skill', 'reviewing-changes', '--activation', 'auto'])).code).toBe(0);
    expect(frontmatter(file)['disable-model-invocation']).toBeUndefined();
    expect(exists(path.join(sb.project, '.agents/skills/reviewing-changes/agents/openai.yaml'))).toBe(false);
    expect((await sb.af(['check'])).code).toBe(0);

    fs.appendFileSync(file, 'my edit\n');
    const res = await sb.af(['configure', 'skill', 'reviewing-changes', '--activation', 'manual']);
    expect(res.stderr).toContain('not applied because the skill has local modifications');
    expect(read(file)).toContain('my edit');
  });

  it('add --activation manual overrides the package default', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--skills', '']);
    await sb.af(['add', 'filing-pr', '--activation', 'manual', '--yes']);
    expect(frontmatter(path.join(sb.project, '.agents/skills/filing-pr/SKILL.md'))['disable-model-invocation']).toBe(true);
  });
});

describe('question preference', () => {
  const PREFER = 'Question preference for this project: when multiple reasonable choices';
  const MINIMIZE = 'Question preference for this project: make reasonable assumptions and continue';
  const skill = (sb: Sandbox, id: string) => read(path.join(sb.project, '.agents/skills', id, 'SKILL.md'));

  it('provider-default, prefer, and minimize render differently into skills with decision points only', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--skills', 'diagnosing-bugs,filing-pr,verifying-changes,interviewing-requirements']);
    const baseline = {
      debug: skill(sb, 'diagnosing-bugs'),
      pr: skill(sb, 'filing-pr'),
      verify: skill(sb, 'verifying-changes'),
    };
    expect(YAML.parse(read(path.join(sb.project, 'agileflow.yaml'))).interaction.questionPreference).toBe('provider-default');
    for (const text of Object.values(baseline)) expect(text).not.toContain('Question preference');

    expect((await sb.af(['configure', 'question-preference', 'prefer'])).code).toBe(0);
    expect(skill(sb, 'diagnosing-bugs')).toContain(PREFER);
    expect(skill(sb, 'filing-pr')).toContain(PREFER);
    expect(skill(sb, 'verifying-changes')).toBe(baseline.verify); // report-only skill: unchanged

    expect((await sb.af(['configure', 'question-preference', 'minimize'])).code).toBe(0);
    expect(skill(sb, 'diagnosing-bugs')).toContain(MINIMIZE);
    expect(skill(sb, 'diagnosing-bugs')).not.toContain(PREFER);

    expect((await sb.af(['configure', 'question-preference', 'provider-default'])).code).toBe(0);
    expect(skill(sb, 'diagnosing-bugs')).toBe(baseline.debug);
    expect(skill(sb, 'filing-pr')).toBe(baseline.pr);
    expect((await sb.af(['check'])).code).toBe(0);
    expect((await sb.af(['configure', 'question-preference', 'always'])).code).toBe(1);
  });

  it('keeps interviewing-requirements manual under prefer and never makes skills read agileflow.yaml', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--skills', 'interviewing-requirements']);
    await sb.af(['configure', 'question-preference', 'prefer']);
    const text = skill(sb, 'interviewing-requirements');
    expect(frontmatter(path.join(sb.project, '.agents/skills/interviewing-requirements/SKILL.md'))['disable-model-invocation']).toBe(true);
    expect(read(path.join(sb.project, '.agents/skills/interviewing-requirements/agents/openai.yaml'))).toContain('allow_implicit_invocation: false');
    expect(YAML.parse(read(path.join(sb.project, 'agileflow.lock'))).resolved['interviewing-requirements'].activation).toBe('manual');
    expect(text).not.toContain('agileflow.yaml');
  });

  it('a modified skill is not re-rendered when the preference changes', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--skills', 'diagnosing-bugs']);
    fs.appendFileSync(path.join(sb.project, '.agents/skills/diagnosing-bugs/SKILL.md'), 'team note\n');
    const res = await sb.af(['configure', 'question-preference', 'prefer']);
    expect(res.stderr).toContain('diagnosing-bugs: local modifications');
    expect(res.stderr).toContain('question preference change not applied because the skill has local modifications');
    expect(skill(sb, 'diagnosing-bugs')).not.toContain(PREFER);
    // The installed base is rendered with the preference it was installed under,
    // so the diff shows only the user's edit, not the preference change.
    const diff = await sb.af(['diff', 'diagnosing-bugs']);
    expect(diff.stdout).toContain('+team note');
    expect(diff.stdout).not.toContain('Question preference');
  });

  it('only the render inputs changed: sync re-renders from the same source package', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--skills', 'diagnosing-bugs']);
    const lock = () => YAML.parse(read(path.join(sb.project, 'agileflow.lock'))).resolved['diagnosing-bugs'];
    const before = lock();
    await sb.af(['configure', 'question-preference', 'minimize']);
    const after = lock();
    expect(after.version).toBe(before.version);
    expect(after.integrity).toBe(before.integrity); // same source
    expect(after.renderedHash).not.toBe(before.renderedHash); // different rendering
    expect((await sb.af(['check'])).code).toBe(0);
  });

  it('a required-interaction skill keeps its questions under minimize', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--skills', 'interviewing-requirements,simplifying-explanations']);
    const plain = skill(sb, 'simplifying-explanations');
    await sb.af(['configure', 'question-preference', 'minimize']);
    const text = skill(sb, 'interviewing-requirements');
    expect(text).toContain('ask the questions this workflow requires');
    expect(text).not.toContain(MINIMIZE);
    expect(skill(sb, 'simplifying-explanations')).toBe(plain); // userInteraction: none
  });

  it('the personal default is set once and applies to new projects and personal skills', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    expect((await sb.af(['configure', 'question-preference', 'prefer', '--global'])).code).toBe(0);
    await sb.af(['init', '--skills', 'diagnosing-bugs']);
    expect(YAML.parse(read(path.join(sb.project, 'agileflow.yaml'))).interaction.questionPreference).toBe('prefer');
    expect(skill(sb, 'diagnosing-bugs')).toContain(PREFER);
    await sb.af(['add', 'filing-pr', '--global', '--yes']);
    expect(read(path.join(sb.home, '.agents/skills/filing-pr/SKILL.md'))).toContain(PREFER);
  });
});

describe('Codex structured questions', () => {
  const codexConfig = (sb: Sandbox) => path.join(sb.home, '.codex', 'config.toml');

  it('is never enabled by init and only changes one setting after explicit consent', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    sb.installProvider('codex');
    fs.mkdirSync(path.join(sb.home, '.codex'), { recursive: true });
    const original =
      '# my codex config\nmodel = "gpt-5"\napproval_policy = "on-request"\n\n[features]\n# keep this comment\nweb_search = true\n\n[mcp_servers.x]\ncommand = "x"\n';
    fs.writeFileSync(codexConfig(sb), original);
    await sb.af(['init', '--yes']);
    expect(read(codexConfig(sb))).toBe(original);

    const status = await sb.af(['configure', 'codex-questions', 'status']);
    expect(status.stdout).toContain('Current: disabled');
    const enable = await sb.af(['configure', 'codex-questions', 'enable', '--yes']);
    expect(enable.code).toBe(0);
    expect(enable.stdout).toContain('Only this setting will change:');
    const after = read(codexConfig(sb));
    expect(after).toBe(original.replace('[features]\n', '[features]\ndefault_mode_request_user_input = true\n'));
    const state = YAML.parse(read(path.join(sb.home, '.config/agileflow/state.yaml')));
    expect(state.providerPatches.codex[0]).toMatchObject({
      path: 'features.default_mode_request_user_input',
      previous: { existed: false },
      applied: true,
    });
    expect((await sb.af(['check'])).stdout).toContain('[ok] Codex structured questions (Default mode request_user_input) enabled');

    const disable = await sb.af(['configure', 'codex-questions', 'disable', '--yes']);
    expect(disable.stdout).toContain('Restored the previous Codex setting.');
    expect(read(codexConfig(sb))).toBe(original);
  });

  it('restores an explicit previous false value and removes a table/file it created', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    fs.mkdirSync(path.join(sb.home, '.codex'), { recursive: true });
    const withFalse = 'model = "x"\n\n[features]\ndefault_mode_request_user_input = false\n';
    fs.writeFileSync(codexConfig(sb), withFalse);
    await sb.af(['configure', 'codex-questions', 'enable', '--yes']);
    expect(read(codexConfig(sb))).toContain('default_mode_request_user_input = true');
    const state = YAML.parse(read(path.join(sb.home, '.config/agileflow/state.yaml')));
    expect(state.providerPatches.codex[0].previous).toEqual({ existed: true, value: false });
    await sb.af(['configure', 'codex-questions', 'disable', '--yes']);
    expect(read(codexConfig(sb))).toBe(withFalse);

    fs.writeFileSync(codexConfig(sb), 'model = "x"\n');
    await sb.af(['configure', 'codex-questions', 'enable', '--yes']);
    expect(read(codexConfig(sb))).toBe('model = "x"\n\n[features]\ndefault_mode_request_user_input = true\n');
    await sb.af(['configure', 'codex-questions', 'disable', '--yes']);
    expect(read(codexConfig(sb))).toBe('model = "x"\n');

    fs.rmSync(codexConfig(sb));
    await sb.af(['configure', 'codex-questions', 'enable', '--yes']);
    await sb.af(['configure', 'codex-questions', 'disable', '--yes']);
    expect(exists(codexConfig(sb))).toBe(false);
  });

  it('never changes a value AgileFlow did not set', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    fs.mkdirSync(path.join(sb.home, '.codex'), { recursive: true });
    const mine = '[features]\ndefault_mode_request_user_input = true\n';
    fs.writeFileSync(codexConfig(sb), mine);
    const res = await sb.af(['configure', 'codex-questions', 'disable', '--yes']);
    expect(res.stdout).toContain('nothing to restore');
    expect(read(codexConfig(sb))).toBe(mine);
  });

  it('interactive flow asks before writing', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    const prompter = scriptedPrompter(['codex-questions', 'enable', false]);
    const res = await sb.af(['configure'], { prompter });
    expect(res.stdout).toContain('AgileFlow does not need this feature to function.');
    expect(res.stdout).toContain('No changes made.');
    expect(exists(codexConfig(sb))).toBe(false);
  });
});

describe('Claude adapter', () => {
  it('leaves Claude-only skills alone and reports a name collision', async () => {
    sb = await createSandbox({ fixture: 'existing-claude-skills' });
    sb.installProvider('claude');
    const mineBefore = read(path.join(sb.project, '.claude/skills/diagnosing-bugs/SKILL.md'));
    const res = await sb.af(['init', '--yes']);
    expect(res.code).toBe(0);
    expect(res.stderr).toContain('.claude/skills/diagnosing-bugs already exists and is not AgileFlow');
    expect(read(path.join(sb.project, '.claude/skills/diagnosing-bugs/SKILL.md'))).toBe(mineBefore);
    expect(isSymlink(path.join(sb.project, '.claude/skills/verifying-changes'))).toBe(true);
    expect(exists(path.join(sb.project, '.claude/skills/my-claude-only-skill/SKILL.md'))).toBe(true);
    const check = await sb.af(['check']);
    expect(check.stdout).toContain('Claude skills shadow AgileFlow skills');
    await sb.af(['remove', 'diagnosing-bugs']);
    expect(read(path.join(sb.project, '.claude/skills/diagnosing-bugs/SKILL.md'))).toBe(mineBefore);
    await sb.af(['remove', '--all', '--delete-skills', '--yes']);
    expect(exists(path.join(sb.project, '.claude/skills/my-claude-only-skill/SKILL.md'))).toBe(true);
    expect(read(path.join(sb.project, '.claude/skills/diagnosing-bugs/SKILL.md'))).toBe(mineBefore);
  });

  it('turning Claude off removes only AgileFlow links; on recreates them', async () => {
    sb = await createSandbox({ fixture: 'existing-claude-skills' });
    sb.installProvider('claude');
    await sb.af(['init', '--yes']);
    expect((await sb.af(['configure', 'provider', 'claude', 'off'])).code).toBe(0);
    expect(exists(path.join(sb.project, '.claude/skills/verifying-changes'))).toBe(false);
    expect(exists(path.join(sb.project, '.claude/skills/my-claude-only-skill'))).toBe(true);
    expect(exists(path.join(sb.project, '.claude/skills/diagnosing-bugs/SKILL.md'))).toBe(true);
    await sb.af(['configure', 'provider', 'claude', 'on']);
    expect(isSymlink(path.join(sb.project, '.claude/skills/verifying-changes'))).toBe(true);
  });

  it('respects a .claude/skills directory that already links to .agents/skills', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    sb.installProvider('claude');
    fs.mkdirSync(path.join(sb.project, '.agents/skills'), { recursive: true });
    fs.mkdirSync(path.join(sb.project, '.claude'));
    fs.symlinkSync('../.agents/skills', path.join(sb.project, '.claude/skills'), 'dir');
    await sb.af(['init', '--yes']);
    expect(isSymlink(path.join(sb.project, '.claude/skills'))).toBe(true);
    expect(isSymlink(path.join(sb.project, '.agents/skills/diagnosing-bugs'))).toBe(false);
    const check = await sb.af(['check', '--verbose']);
    expect(check.code).toBe(0);
    expect(check.stdout).toContain(`directory link: ${lockedIds(sb).length}`);
    await sb.af(['remove', 'diagnosing-bugs']);
    expect(exists(path.join(sb.project, '.agents/skills/verifying-changes/SKILL.md'))).toBe(true);
  });

  it('falls back to marked mirrors when links are unavailable', async () => {
    sb = await createSandbox({ fixture: 'windows-mirror' });
    sb.installProvider('claude');
    sb.env.AGILEFLOW_LINK_MODE = 'mirror';
    await sb.af(['init', '--yes']);
    const marker = JSON.parse(read(path.join(sb.project, '.claude/skills/diagnosing-bugs/.agileflow-mirror.json')));
    expect(marker).toMatchObject({ generatedBy: 'agileflow', provider: 'claude', source: '.agents/skills/diagnosing-bugs' });
    expect((await sb.af(['check', '--verbose'])).stdout).toContain(`mirror: ${lockedIds(sb).length}`);
    await sb.af(['remove', 'diagnosing-bugs']);
    expect(exists(path.join(sb.project, '.claude/skills/diagnosing-bugs'))).toBe(false);
    await sb.af(['remove', '--all', '--yes']);
    expect(exists(path.join(sb.project, '.claude/skills/verifying-changes/.agileflow-mirror.json'))).toBe(false);
    expect(exists(path.join(sb.project, '.claude/skills/verifying-changes/SKILL.md'))).toBe(true);
  });
});
