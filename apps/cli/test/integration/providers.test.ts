import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { scriptedPrompter } from '../../src/ui/prompts';
import { createSandbox, exists, isSymlink, read, type Sandbox } from '../helpers';

let sb: Sandbox;
afterEach(() => sb?.cleanup());

function frontmatter(file: string): Record<string, unknown> {
  const m = /^---\n([\s\S]*?)\n---/.exec(read(file));
  return YAML.parse(m![1]!);
}

describe('manual invocation translation', () => {
  it('manual skills get Claude/Cursor, OpenCode, and Codex flags; Gemini is reported as semantic', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    sb.installProvider('claude');
    sb.installProvider('codex');
    sb.installProvider('gemini');
    await sb.af(['init', '--skills', 'interviewing-requirements,diagnosing-bugs']);
    const dir = path.join(sb.project, '.agents/skills/interviewing-requirements');
    const fm = frontmatter(path.join(dir, 'SKILL.md'));
    expect(fm['disable-model-invocation']).toBe(true);
    expect(fm.metadata).toEqual({ 'opencode/autoinvoke': false });
    expect(YAML.parse(read(path.join(dir, 'agents/openai.yaml')))).toEqual({ policy: { allow_implicit_invocation: false } });
    const auto = frontmatter(path.join(sb.project, '.agents/skills/diagnosing-bugs/SKILL.md'));
    expect(auto['disable-model-invocation']).toBeUndefined();
    expect(exists(path.join(sb.project, '.agents/skills/diagnosing-bugs/agents'))).toBe(false);

    const check = await sb.af(['check']);
    expect(check.code).toBe(0);
    expect(check.stdout).toContain('Gemini manual-only enforcement: semantic');
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
  it('adds one line to interactive skills only, and none by default', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--skills', 'interviewing-requirements,diagnosing-bugs']);
    const interview = path.join(sb.project, '.agents/skills/interviewing-requirements/SKILL.md');
    const debug = path.join(sb.project, '.agents/skills/diagnosing-bugs/SKILL.md');
    const debugBefore = read(debug);
    expect(read(interview)).not.toContain('Project question preference');
    expect((await sb.af(['configure', 'question-preference', 'prefer'])).code).toBe(0);
    expect(read(interview)).toContain('Project question preference: when a decision would materially change the result');
    expect(read(debug)).toBe(debugBefore);
    await sb.af(['configure', 'question-preference', 'minimize']);
    expect(read(interview)).toContain('ask only when blocked');
    await sb.af(['configure', 'question-preference', 'provider-default']);
    expect(read(interview)).not.toContain('Project question preference');
    expect((await sb.af(['configure', 'question-preference', 'always'])).code).toBe(1);
  });

  it('new projects take the personal default', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['configure', 'question-preference', 'minimize', '--global']);
    await sb.af(['init', '--skills', '']);
    expect(YAML.parse(read(path.join(sb.project, 'agileflow.yaml'))).interaction.questionPreference).toBe('minimize');
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
    expect(check.stdout).toContain('directory link: 4');
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
    expect((await sb.af(['check', '--verbose'])).stdout).toContain('mirror: 4');
    await sb.af(['remove', 'diagnosing-bugs']);
    expect(exists(path.join(sb.project, '.claude/skills/diagnosing-bugs'))).toBe(false);
    await sb.af(['remove', '--all', '--yes']);
    expect(exists(path.join(sb.project, '.claude/skills/verifying-changes/.agileflow-mirror.json'))).toBe(false);
    expect(exists(path.join(sb.project, '.claude/skills/verifying-changes/SKILL.md'))).toBe(true);
  });
});
