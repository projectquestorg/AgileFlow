import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { createSandbox, exists, FIXTURES_DIR, isSymlink, read, snapshotFiles, tree, type Sandbox } from '../helpers';

let sb: Sandbox;
afterEach(() => sb?.cleanup());

const CORE = ['checking-blast-radius', 'diagnosing-bugs', 'reviewing-changes', 'verifying-changes'];

describe('init', () => {
  it('creates only agileflow.yaml, agileflow.lock, .agents/skills and Claude links (golden tree)', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    sb.installProvider('claude');
    const res = await sb.af(['init', '--yes']);
    expect(res.code).toBe(0);
    const actual = tree(sb.project, { skip: (rel) => rel === '.git' || rel.includes('/evals/') || rel.endsWith('/evals') });
    const golden = read(path.join(FIXTURES_DIR, '_golden', 'init-clean-node.tree')).trim().split('\n');
    expect(actual).toEqual(golden);
    expect(res.stdout).toContain('AgileFlow will leave them unchanged.');
  });

  it('never scaffolds docs, .agileflow, AGENTS.md, or hooks', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    sb.installProvider('claude');
    sb.installProvider('codex');
    await sb.af(['init', '--yes']);
    for (const p of ['docs', '.agileflow', 'AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.claude/settings.json', '.codex']) {
      expect(exists(path.join(sb.project, p)), p).toBe(false);
    }
    expect(fs.readdirSync(path.join(sb.project, '.claude'))).toEqual(['skills']);
  });

  it('does not create Claude links when Claude is not detected', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--yes']);
    expect(fs.readdirSync(path.join(sb.project, '.agents', 'skills')).sort()).toEqual(CORE);
    expect(exists(path.join(sb.project, '.claude'))).toBe(false);
  });

  it('changes no provider settings (permissions, sandbox, model, hooks)', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    sb.installProvider('claude');
    sb.installProvider('codex');
    fs.mkdirSync(path.join(sb.home, '.codex'), { recursive: true });
    fs.writeFileSync(path.join(sb.home, '.codex', 'config.toml'), '# mine\nmodel = "gpt-5"\n');
    fs.mkdirSync(path.join(sb.home, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(sb.home, '.claude', 'settings.json'), '{"permissions":{"allow":[]}}\n');
    fs.mkdirSync(path.join(sb.project, '.claude'), { recursive: true });
    fs.writeFileSync(path.join(sb.project, '.claude', 'settings.json'), '{"hooks":{}}\n');
    const files = [
      path.join(sb.home, '.codex', 'config.toml'),
      path.join(sb.home, '.claude', 'settings.json'),
      path.join(sb.project, '.claude', 'settings.json'),
    ];
    const before = files.map(read);
    expect((await sb.af(['init', '--yes'])).code).toBe(0);
    expect(files.map(read)).toEqual(before);
  });

  it('writes a readable config and a lockfile with integrity and base hashes', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--yes']);
    const config = YAML.parse(read(path.join(sb.project, 'agileflow.yaml')));
    expect(Object.keys(config.skills).sort()).toEqual(CORE);
    expect(config.skills['diagnosing-bugs']).toEqual({ source: '@agileflow/diagnosing-bugs', version: '^1' });
    expect(read(path.join(sb.project, 'agileflow.yaml'))).not.toContain('skills: {');
    const lock = YAML.parse(read(path.join(sb.project, 'agileflow.lock')));
    const entry = lock.resolved['diagnosing-bugs'];
    expect(entry).toMatchObject({ version: '1.0.0', path: '.agents/skills/diagnosing-bugs', ownership: 'managed' });
    expect(entry.integrity).toMatch(/^sha256-/);
    expect(entry.baseHash).toMatch(/^sha256-/);
  });

  it('installs selected skills with --skills and reports an already-initialized project', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    expect((await sb.af(['init', '--skills', 'filing-pr,interviewing-requirements'])).code).toBe(0);
    expect(fs.readdirSync(path.join(sb.project, '.agents', 'skills')).sort()).toEqual([
      'filing-pr',
      'interviewing-requirements',
    ]);
    const again = await sb.af(['init', '--yes']);
    expect(again.code).toBe(0);
    expect(again.stdout).toContain('already set up');
  });
});

describe('add and remove', () => {
  it('adds skills and packs and shows what they contain', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--skills', '']);
    const res = await sb.af(['add', 'babysitting-pr', '--yes']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Skill: babysitting-pr');
    expect(res.stdout).toContain('0 executable scripts');
    expect(res.stdout).toContain('gh on PATH');
    const pack = await sb.af(['add', '@agileflow/github', '--yes']);
    expect(pack.code).toBe(0);
    expect(pack.stdout).toContain('already installed: babysitting-pr');
    expect(fs.readdirSync(path.join(sb.project, '.agents', 'skills')).sort()).toEqual([
      'babysitting-pr',
      'filing-pr',
      'resolving-conflicts',
    ]);
  });

  it('refuses to overwrite an unmanaged skill with the same name', async () => {
    sb = await createSandbox({ fixture: 'existing-agents-skills' });
    await sb.af(['init', '--skills', '']);
    fs.mkdirSync(path.join(sb.project, '.agents/skills/filing-pr'));
    fs.writeFileSync(path.join(sb.project, '.agents/skills/filing-pr/SKILL.md'), '---\nname: filing-pr\ndescription: mine. Use when x.\n---\n');
    const res = await sb.af(['add', 'filing-pr', '--yes']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('not managed by AgileFlow');
    expect(read(path.join(sb.project, '.agents/skills/filing-pr/SKILL.md'))).toContain('mine');
  });

  it('removes only owned files and keeps unknown skills', async () => {
    sb = await createSandbox({ fixture: 'existing-agents-skills' });
    sb.installProvider('claude');
    await sb.af(['init', '--yes']);
    const res = await sb.af(['remove', 'diagnosing-bugs']);
    expect(res.code).toBe(0);
    expect(exists(path.join(sb.project, '.agents/skills/diagnosing-bugs'))).toBe(false);
    expect(exists(path.join(sb.project, '.claude/skills/diagnosing-bugs'))).toBe(false);
    expect(exists(path.join(sb.project, '.agents/skills/my-team-release/SKILL.md'))).toBe(true);
    expect(exists(path.join(sb.project, '.agents/skills/strange-custom-tool/SKILL.md'))).toBe(true);
    expect(YAML.parse(read(path.join(sb.project, 'agileflow.yaml'))).skills['diagnosing-bugs']).toBeUndefined();
    const unmanaged = await sb.af(['remove', 'my-team-release']);
    expect(unmanaged.code).toBe(1);
    expect(unmanaged.stderr).toContain('not managed by AgileFlow');
    expect(exists(path.join(sb.project, '.agents/skills/my-team-release/SKILL.md'))).toBe(true);
  });

  it('refuses to remove a modified skill without --force', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--yes']);
    fs.appendFileSync(path.join(sb.project, '.agents/skills/verifying-changes/SKILL.md'), '\nmy note\n');
    const res = await sb.af(['remove', 'verifying-changes']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('local modifications');
    expect(exists(path.join(sb.project, '.agents/skills/verifying-changes'))).toBe(true);
    expect((await sb.af(['remove', 'verifying-changes', '--force'])).code).toBe(0);
    expect(exists(path.join(sb.project, '.agents/skills/verifying-changes'))).toBe(false);
  });

  it('disabling a skill removes its files but keeps it in config and lock', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    sb.installProvider('claude');
    await sb.af(['init', '--yes']);
    expect((await sb.af(['configure', 'skill', 'reviewing-changes', '--disable'])).code).toBe(0);
    expect(exists(path.join(sb.project, '.agents/skills/reviewing-changes'))).toBe(false);
    expect(exists(path.join(sb.project, '.claude/skills/reviewing-changes'))).toBe(false);
    expect(YAML.parse(read(path.join(sb.project, 'agileflow.lock'))).resolved['reviewing-changes'].enabled).toBe(false);
    expect((await sb.af(['configure', 'skill', 'reviewing-changes', '--enable'])).code).toBe(0);
    expect(exists(path.join(sb.project, '.agents/skills/reviewing-changes/SKILL.md'))).toBe(true);
    expect(isSymlink(path.join(sb.project, '.claude/skills/reviewing-changes'))).toBe(true);
  });

  it('remove --all keeps working standalone skills and removes AgileFlow files', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    sb.installProvider('claude');
    await sb.af(['init', '--yes']);
    const res = await sb.af(['remove', '--all', '--yes']);
    expect(res.code).toBe(0);
    expect(exists(path.join(sb.project, 'agileflow.yaml'))).toBe(false);
    expect(exists(path.join(sb.project, 'agileflow.lock'))).toBe(false);
    const skill = read(path.join(sb.project, '.agents/skills/diagnosing-bugs/SKILL.md'));
    expect(skill).not.toContain('Managed by AgileFlow');
    expect(skill).toMatch(/^---\nname: diagnosing-bugs\n/);
    expect(isSymlink(path.join(sb.project, '.claude/skills/diagnosing-bugs'))).toBe(true);
  });

  it('remove --all --delete-skills deletes only unmodified AgileFlow skills', async () => {
    sb = await createSandbox({ fixture: 'existing-agents-skills' });
    sb.installProvider('claude');
    await sb.af(['init', '--yes']);
    fs.appendFileSync(path.join(sb.project, '.agents/skills/diagnosing-bugs/SKILL.md'), 'edit\n');
    const res = await sb.af(['remove', '--all', '--delete-skills', '--yes']);
    expect(res.code).toBe(0);
    expect(exists(path.join(sb.project, '.agents/skills/verifying-changes'))).toBe(false);
    expect(exists(path.join(sb.project, '.claude/skills/verifying-changes'))).toBe(false);
    expect(exists(path.join(sb.project, '.agents/skills/diagnosing-bugs'))).toBe(true);
    expect(exists(path.join(sb.project, '.agents/skills/my-team-release'))).toBe(true);
  });
});

describe('sync', () => {
  it('restores skills from the lockfile offline using the package cache', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    sb.installProvider('claude');
    await sb.af(['init', '--yes']);
    const before = snapshotFiles(sb.project, ['.agents/skills/diagnosing-bugs/SKILL.md']);
    fs.rmSync(path.join(sb.project, '.agents'), { recursive: true });
    fs.rmSync(path.join(sb.project, '.claude'), { recursive: true });
    fs.rmSync(sb.registry, { recursive: true });
    const res = await sb.af(['sync']);
    expect(res.code).toBe(0);
    expect(snapshotFiles(sb.project, ['.agents/skills/diagnosing-bugs/SKILL.md'])).toEqual(before);
    expect(isSymlink(path.join(sb.project, '.claude/skills/diagnosing-bugs'))).toBe(true);
  });

  it('refuses when the lockfile does not match agileflow.yaml', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--yes']);
    fs.appendFileSync(path.join(sb.project, 'agileflow.yaml'), '');
    const cfg = read(path.join(sb.project, 'agileflow.yaml')).replace(
      'skills:\n',
      'skills:\n  filing-pr:\n    source: "@agileflow/filing-pr"\n',
    );
    fs.writeFileSync(path.join(sb.project, 'agileflow.yaml'), cfg);
    const res = await sb.af(['sync']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('filing-pr: in agileflow.yaml but not in agileflow.lock');
    expect(res.stderr).toContain('agileflow update');
    expect((await sb.af(['update', '--yes'])).code).toBe(0);
    expect(exists(path.join(sb.project, '.agents/skills/filing-pr/SKILL.md'))).toBe(true);
  });

  it('removes stale skills that disappeared from the lockfile, but only when unmodified', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--yes']);
    // Simulate `git pull` of a teammate's change that dropped two skills.
    const lock = YAML.parse(read(path.join(sb.project, 'agileflow.lock')));
    const cfg = YAML.parse(read(path.join(sb.project, 'agileflow.yaml')));
    for (const id of ['reviewing-changes', 'verifying-changes']) {
      delete lock.resolved[id];
      delete cfg.skills[id];
    }
    fs.writeFileSync(path.join(sb.project, 'agileflow.lock'), YAML.stringify(lock));
    fs.writeFileSync(path.join(sb.project, 'agileflow.yaml'), YAML.stringify(cfg));
    fs.appendFileSync(path.join(sb.project, '.agents/skills/verifying-changes/SKILL.md'), 'mine\n');
    const res = await sb.af(['sync']);
    expect(res.code).toBe(0);
    expect(exists(path.join(sb.project, '.agents/skills/reviewing-changes'))).toBe(false);
    expect(exists(path.join(sb.project, '.agents/skills/verifying-changes/SKILL.md'))).toBe(true);
    expect(res.stderr).toContain('verifying-changes');
  });
});

describe('check', () => {
  it('reports healthy, then a missing skill, and --fix restores it', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    sb.installProvider('claude');
    await sb.af(['init', '--yes']);
    const healthy = await sb.af(['check']);
    expect(healthy.code).toBe(0);
    expect(healthy.stdout).toContain('[ok] agileflow.yaml valid');
    expect(healthy.stdout).toContain('[ok] Claude compatibility links valid');
    expect(healthy.stdout).toContain('Result: healthy');
    expect(healthy.stdout).not.toMatch(/[✓✅❌]/);

    fs.rmSync(path.join(sb.project, '.agents/skills/diagnosing-bugs'), { recursive: true });
    fs.unlinkSync(path.join(sb.project, '.claude/skills/verifying-changes'));
    const broken = await sb.af(['check']);
    expect(broken.code).toBe(1);
    expect(broken.stdout).toContain('1 skill missing');
    expect(broken.stdout).toContain('Claude compatibility links missing');

    const fixed = await sb.af(['check', '--fix']);
    expect(fixed.code).toBe(0);
    expect(fixed.stdout).toContain('restored skills: diagnosing-bugs');
    expect(isSymlink(path.join(sb.project, '.claude/skills/verifying-changes'))).toBe(true);
  });

  it('reports invalid configuration clearly', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--yes']);
    fs.writeFileSync(path.join(sb.project, 'agileflow.yaml'), 'version: 2\nskills: []\n');
    const res = await sb.af(['check']);
    expect(res.code).toBe(1);
    expect(res.stdout).toContain('agileflow.yaml is invalid');
  });

  it('flags modified skills, duplicate names, and invalid unmanaged skills without failing on them', async () => {
    sb = await createSandbox({ fixture: 'existing-agents-skills' });
    await sb.af(['init', '--yes']);
    fs.appendFileSync(path.join(sb.project, '.agents/skills/diagnosing-bugs/SKILL.md'), 'x\n');
    fs.writeFileSync(path.join(sb.project, '.agents/skills/strange-custom-tool/SKILL.md'), '---\nname: my-team-release\ndescription: dup. Use when x.\n---\n');
    const res = await sb.af(['check', '--verbose']);
    expect(res.stdout).toContain('1 managed skill with local modifications');
    expect(res.stdout).toContain('duplicate skill names');
    expect(res.stdout).toContain('unmanaged skills with invalid SKILL.md');
    expect(res.stdout).toContain('config:');
  });

  it('check --json is machine-readable', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--yes']);
    const res = await sb.af(['check', '--json']);
    const parsed = JSON.parse(res.stdout);
    expect(parsed[0].healthy).toBe(true);
  });
});

describe('list and shims', () => {
  it('lists skills, unmanaged skills, and providers', async () => {
    sb = await createSandbox({ fixture: 'existing-agents-skills' });
    sb.installProvider('codex');
    await sb.af(['init', '--skills', 'diagnosing-bugs,interviewing-requirements']);
    const res = await sb.af(['list']);
    expect(res.stdout).toMatch(/diagnosing-bugs\s+1\.0\.0\s+auto\s+official\s+clean/);
    expect(res.stdout).toMatch(/interviewing-requirements\s+1\.0\.0\s+manual\s+official\s+clean/);
    expect(res.stdout).toContain('Not managed by AgileFlow (left untouched): my-team-release, strange-custom-tool');
    expect(res.stdout).toMatch(/Codex\s+native \.agents\/skills\n/);
    expect(res.stdout).toMatch(/Claude\s+linked \.claude\/skills \(not detected\)/);
    const json = JSON.parse((await sb.af(['list', '--json'])).stdout);
    expect(json.project.rows).toHaveLength(2);
  });

  it('`doctor` runs check; the removed `hook` command points stale v4 hooks at migrate (exit 1, never 2)', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--yes']);
    const doctor = await sb.af(['doctor']);
    expect(doctor.stdout).toContain('`agileflow doctor` was renamed to `agileflow check` in v5.');
    expect(doctor.code).toBe(0);
    const hook = await sb.af(['hook', 'PreToolUse', '--matcher', 'Bash']);
    expect(hook.code).toBe(1);
    expect(hook.stderr).toContain('agileflow migrate v4');
  });

  it('help lists the MVP commands and no removed ones; unknown commands exit 1 (never 2)', async () => {
    sb = await createSandbox({ git: false });
    const help = await sb.af(['--help']);
    for (const cmd of ['init', 'add', 'remove', 'list', 'sync', 'update', 'check', 'configure', 'fork', 'diff', 'migrate', 'eval']) {
      expect(help.stdout).toMatch(new RegExp(`\\n  ${cmd}\\b`));
    }
    for (const cmd of ['doctor', 'hook', 'setup', 'plugins', 'launch', 'learn', 'status']) {
      expect(help.stdout).not.toMatch(new RegExp(`\\n  ${cmd}\\b`));
    }
    expect((await sb.af(['setup'])).code).toBe(1);
    expect((await sb.af(['launch'])).code).toBe(1);
  });
});

describe('unknown user skills', () => {
  it('survive every operation byte-for-byte', async () => {
    sb = await createSandbox({ fixture: 'existing-agents-skills' });
    sb.installProvider('claude');
    fs.mkdirSync(path.join(sb.project, '.claude/skills/claude-only'), { recursive: true });
    fs.writeFileSync(path.join(sb.project, '.claude/skills/claude-only/SKILL.md'), '---\nname: claude-only\ndescription: Mine. Use when x.\n---\n');
    const userFiles = [
      '.agents/skills/my-team-release/SKILL.md',
      '.agents/skills/strange-custom-tool/SKILL.md',
      '.claude/skills/claude-only/SKILL.md',
      'AGENTS.md',
    ];
    const before = snapshotFiles(sb.project, userFiles);
    const steps: string[][] = [
      ['init', '--yes'],
      ['add', 'filing-pr', '--yes'],
      ['sync'],
      ['check', '--fix'],
      ['configure', 'skill', 'filing-pr', '--activation', 'manual'],
      ['configure', 'question-preference', 'prefer'],
      ['fork', 'verifying-changes'],
      ['remove', 'filing-pr'],
      ['configure', 'provider', 'claude', 'off'],
      ['configure', 'provider', 'claude', 'on'],
      ['remove', '--all', '--delete-skills', '--yes'],
    ];
    await sb.publish('diagnosing-bugs', '1.1.0', (t) => `${t}\nnew\n`);
    for (const step of steps) {
      if (step[0] === 'sync') await sb.af(['update', '--yes']);
      await sb.af(step);
      expect(snapshotFiles(sb.project, userFiles), step.join(' ')).toEqual(before);
    }
  });
});

describe('interactive flows', () => {
  it('init asks where and which workflows, recommending core (and GitHub skills for GitHub repos)', async () => {
    const { scriptedPrompter } = await import('../../src/ui/prompts');
    sb = await createSandbox({ fixture: 'clean-node' });
    fs.appendFileSync(path.join(sb.project, '.git/config'), '[remote "origin"]\n\turl = git@github.com:acme/app.git\n');
    let offered: string[] = [];
    const prompter = scriptedPrompter(['project', ['diagnosing-bugs', 'babysitting-pr']]);
    const original = prompter.multiselect.bind(prompter);
    prompter.multiselect = async (message, choices, initial, required) => {
      offered = initial as string[];
      expect(choices.map((c) => c.value)).toContain('simplifying-explanations');
      return original(message, choices, initial, required);
    };
    const res = await sb.af(['init'], { prompter });
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('GitHub');
    expect(offered).toEqual(['diagnosing-bugs', 'checking-blast-radius', 'verifying-changes', 'filing-pr', 'babysitting-pr']);
    expect(fs.readdirSync(path.join(sb.project, '.agents/skills')).sort()).toEqual(['babysitting-pr', 'diagnosing-bugs']);
  });

  it('init can set up personal skills instead', async () => {
    const { scriptedPrompter } = await import('../../src/ui/prompts');
    sb = await createSandbox({ fixture: 'clean-node' });
    const res = await sb.af(['init'], { prompter: scriptedPrompter(['personal', ['filing-pr']]) });
    expect(res.code).toBe(0);
    expect(exists(path.join(sb.home, '.agents/skills/filing-pr/SKILL.md'))).toBe(true);
    expect(exists(path.join(sb.project, 'agileflow.yaml'))).toBe(false);
  });

  it('add without arguments offers the catalog and asks before installing', async () => {
    const { scriptedPrompter } = await import('../../src/ui/prompts');
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--yes']);
    const declined = await sb.af(['add'], { prompter: scriptedPrompter([['@agileflow/filing-pr'], false]) });
    expect(declined.stdout).toContain('Nothing installed.');
    expect(exists(path.join(sb.project, '.agents/skills/filing-pr'))).toBe(false);
    const accepted = await sb.af(['add'], { prompter: scriptedPrompter([['@agileflow/filing-pr'], true]) });
    expect(accepted.code).toBe(0);
    expect(exists(path.join(sb.project, '.agents/skills/filing-pr/SKILL.md'))).toBe(true);
  });
});
