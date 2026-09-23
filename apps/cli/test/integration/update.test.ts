import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { scriptedPrompter } from '../../src/ui/prompts';
import { createSandbox, exists, isSymlink, read, type Sandbox } from '../helpers';

let sb: Sandbox;
afterEach(() => sb?.cleanup());

const skillFile = (sb: Sandbox, id: string) => path.join(sb.project, '.agents/skills', id, 'SKILL.md');
const lockOf = (sb: Sandbox) => YAML.parse(read(path.join(sb.project, 'agileflow.lock')));

async function initWithUpdate(fixture = 'clean-node'): Promise<Sandbox> {
  const s = await createSandbox({ fixture });
  s.installProvider('claude');
  await s.af(['init', '--yes']);
  await s.publish('diagnosing-bugs', '1.1.0', (t) => t.replace('Establish evidence before changing code.', 'Establish evidence before changing code. (v1.1)'));
  return s;
}

describe('update', () => {
  it('clean update: 1.0 -> 1.1 with no user edits replaces cleanly', async () => {
    sb = await initWithUpdate();
    const res = await sb.af(['update', '--yes']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('diagnosing-bugs  1.0.0 -> 1.1.0');
    expect(res.stdout).toContain('All managed skills are clean.');
    expect(read(skillFile(sb, 'diagnosing-bugs'))).toContain('(v1.1)');
    expect(lockOf(sb).resolved['diagnosing-bugs'].version).toBe('1.1.0');
    expect(isSymlink(path.join(sb.project, '.claude/skills/diagnosing-bugs'))).toBe(true);
    expect((await sb.af(['check'])).code).toBe(0);
    expect((await sb.af(['update'])).stdout).toContain('Everything is up to date.');
  });

  it('dirty update: never overwrites; non-interactive exits 3 with instructions', async () => {
    sb = await initWithUpdate();
    fs.appendFileSync(skillFile(sb, 'diagnosing-bugs'), '\nOur team rule.\n');
    const before = read(skillFile(sb, 'diagnosing-bugs'));
    const res = await sb.af(['update', '--non-interactive']);
    expect(res.code).toBe(3);
    expect(res.stdout).toContain('SKIPPED diagnosing-bugs');
    expect(res.stdout).toContain('Reason: local modifications');
    expect(res.stdout).toContain('agileflow diff diagnosing-bugs');
    expect(res.stdout).toContain('agileflow fork diagnosing-bugs');
    expect(res.stdout).toContain('agileflow update --reset diagnosing-bugs');
    expect(read(skillFile(sb, 'diagnosing-bugs'))).toBe(before);
    expect(lockOf(sb).resolved['diagnosing-bugs'].version).toBe('1.0.0');
    expect(exists(path.join(sb.project, '.agileflow'))).toBe(false);
  });

  it('dirty update: --reset discards local edits explicitly', async () => {
    sb = await initWithUpdate();
    fs.appendFileSync(skillFile(sb, 'diagnosing-bugs'), '\nOur team rule.\n');
    const res = await sb.af(['update', '--non-interactive', '--reset', 'diagnosing-bugs']);
    expect(res.code).toBe(0);
    expect(read(skillFile(sb, 'diagnosing-bugs'))).not.toContain('Our team rule.');
    expect(read(skillFile(sb, 'diagnosing-bugs'))).toContain('(v1.1)');
  });

  it('interactive: Diff shows both diffs, then Skip leaves the skill unchanged', async () => {
    sb = await initWithUpdate();
    fs.appendFileSync(skillFile(sb, 'diagnosing-bugs'), '\nOur team rule.\n');
    const prompter = scriptedPrompter([true, 'diff', 'skip']);
    const res = await sb.af(['update'], { prompter });
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('diagnosing-bugs has local modifications.');
    expect(res.stdout).toContain('+Our team rule.');
    expect(res.stdout).toContain('+Establish evidence before changing code. (v1.1)');
    expect(read(skillFile(sb, 'diagnosing-bugs'))).toContain('Our team rule.');
    expect(lockOf(sb).resolved['diagnosing-bugs'].version).toBe('1.0.0');
  });

  it('interactive: Reset installs the new version', async () => {
    sb = await initWithUpdate();
    fs.appendFileSync(skillFile(sb, 'diagnosing-bugs'), '\nOur team rule.\n');
    const res = await sb.af(['update'], { prompter: scriptedPrompter([true, 'reset']) });
    expect(res.code).toBe(0);
    expect(read(skillFile(sb, 'diagnosing-bugs'))).toContain('(v1.1)');
    expect(read(skillFile(sb, 'diagnosing-bugs'))).not.toContain('Our team rule.');
  });

  it('interactive: Fork keeps the customized skill and stops tracking upstream', async () => {
    sb = await initWithUpdate();
    fs.appendFileSync(skillFile(sb, 'diagnosing-bugs'), '\nOur team rule.\n');
    const res = await sb.af(['update'], { prompter: scriptedPrompter([true, 'fork']) });
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Forked diagnosing-bugs');
    const text = read(skillFile(sb, 'diagnosing-bugs'));
    expect(text).toContain('Our team rule.');
    expect(text).not.toContain('Managed by AgileFlow');
    const cfg = YAML.parse(read(path.join(sb.project, 'agileflow.yaml')));
    expect(cfg.skills['diagnosing-bugs']).toEqual({
      source: '.agents/skills/diagnosing-bugs',
      provenance: { forkedFrom: '@agileflow/diagnosing-bugs@1.0.0' },
    });
  });

  it('respects the semver range: a new major version is not installed by ^1', async () => {
    sb = await initWithUpdate();
    await sb.publish('diagnosing-bugs', '2.0.0', (t) => t.replace('(v1.1)', '(v2)'));
    await sb.af(['update', '--yes']);
    expect(lockOf(sb).resolved['diagnosing-bugs'].version).toBe('1.1.0');
    const cfg = read(path.join(sb.project, 'agileflow.yaml')).replace(
      /(diagnosing-bugs:\n\s+source: "@agileflow\/diagnosing-bugs"\n\s+version:) \^1/,
      '$1 ^2',
    );
    fs.writeFileSync(path.join(sb.project, 'agileflow.yaml'), cfg);
    expect((await sb.af(['sync'])).code).toBe(1);
    expect((await sb.af(['update', '--yes'])).code).toBe(0);
    expect(lockOf(sb).resolved['diagnosing-bugs'].version).toBe('2.0.0');
  });

  it('--dry-run changes nothing', async () => {
    sb = await initWithUpdate();
    const lockBefore = read(path.join(sb.project, 'agileflow.lock'));
    const res = await sb.af(['update', '--dry-run']);
    expect(res.stdout).toContain('Would update:');
    expect(read(path.join(sb.project, 'agileflow.lock'))).toBe(lockBefore);
  });

  it('provider mirror: canonical changes refresh the Claude mirror', async () => {
    sb = await createSandbox({ fixture: 'windows-mirror' });
    sb.installProvider('claude');
    sb.env.AGILEFLOW_LINK_MODE = 'mirror';
    await sb.af(['init', '--yes']);
    const mirror = path.join(sb.project, '.claude/skills/diagnosing-bugs');
    expect(isSymlink(mirror)).toBe(false);
    expect(exists(path.join(mirror, '.agileflow-mirror.json'))).toBe(true);
    await sb.publish('diagnosing-bugs', '1.1.0', (t) => t.replace('Establish evidence before changing code.', 'Evidence first. (v1.1)'));
    expect((await sb.af(['update', '--yes'])).code).toBe(0);
    expect(read(path.join(mirror, 'SKILL.md'))).toContain('Evidence first. (v1.1)');
    expect((await sb.af(['check'])).code).toBe(0);

    // A direct edit to the mirror is detected and never silently overwritten.
    fs.appendFileSync(path.join(mirror, 'SKILL.md'), 'edited the wrong copy\n');
    const check = await sb.af(['check']);
    expect(check.stdout).toContain('Claude mirrors were edited directly');
    expect(check.stdout).toContain('the canonical copy is .agents/skills/diagnosing-bugs');
    await sb.af(['sync']);
    expect(read(path.join(mirror, 'SKILL.md'))).toContain('edited the wrong copy');
  });
});

describe('fork and diff', () => {
  it('fork: the user owns the skill permanently and updates ignore it', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--yes']);
    const res = await sb.af(['fork', 'diagnosing-bugs']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('diagnosing-bugs is now locally owned.');
    expect(res.stdout).toContain('@agileflow/diagnosing-bugs@1.0.0');
    expect(res.stdout).toContain('AgileFlow will no longer overwrite this skill during updates.');
    fs.appendFileSync(skillFile(sb, 'diagnosing-bugs'), '\nMine now.\n');

    await sb.publish('diagnosing-bugs', '1.1.0', (t) => `${t}\nUpstream addition.\n`);
    const upd = await sb.af(['update', '--non-interactive']);
    expect(upd.code).toBe(0);
    expect(read(skillFile(sb, 'diagnosing-bugs'))).toContain('Mine now.');
    expect(read(skillFile(sb, 'diagnosing-bugs'))).not.toContain('Upstream addition.');
    expect(upd.stdout).toContain('Your fork diagnosing-bugs originated from @agileflow/diagnosing-bugs@1.0.0.');
    expect(upd.stdout).toContain('Upstream is now 1.1.0.');
    expect(upd.stdout).toContain('agileflow diff diagnosing-bugs --upstream');

    const diff = await sb.af(['diff', 'diagnosing-bugs', '--upstream']);
    expect(diff.code).toBe(0);
    expect(diff.stdout).toContain('+Upstream addition.');
    expect(diff.stdout).toContain('-Mine now.');

    expect((await sb.af(['check'])).code).toBe(0);
    expect((await sb.af(['list'])).stdout).toMatch(/diagnosing-bugs\s+local\s+auto\s+fork of @agileflow\/diagnosing-bugs@1\.0\.0\s+local/);
    const removed = await sb.af(['remove', 'diagnosing-bugs']);
    expect(removed.stdout).toContain('are yours and were kept');
    expect(read(skillFile(sb, 'diagnosing-bugs'))).toContain('Mine now.');
  });

  it('diff shows installed base vs current, and reports no differences when clean', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--yes']);
    expect((await sb.af(['diff', 'verifying-changes'])).stdout).toContain('No differences.');
    fs.appendFileSync(skillFile(sb, 'verifying-changes'), 'local tweak\n');
    const diff = await sb.af(['diff', 'verifying-changes']);
    expect(diff.stdout).toContain('--- verifying-changes@1.0.0 (installed)/SKILL.md');
    expect(diff.stdout).toContain('+local tweak');
  });
});
