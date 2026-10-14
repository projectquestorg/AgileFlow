import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { createSandbox, exists, isSymlink, read, type Sandbox } from '../helpers';
import { scriptedPrompter } from '../../src/ui/prompts';

let sb: Sandbox;
afterEach(() => sb?.cleanup());

const lockOf = (s: Sandbox) => YAML.parse(read(path.join(s.project, 'agileflow.lock')));
const configOf = (s: Sandbox) => YAML.parse(read(path.join(s.project, 'agileflow.yaml')));

function writeSkill(dir: string, name: string, body: string) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), `---\nname: ${name}\ndescription: Team skill ${name}. Use when testing adoption.\n---\n\n${body}\n`);
}

/** A project whose skills were installed by AgileFlow and then detached (standalone copies, no lock). */
async function detachedProject(): Promise<Sandbox> {
  const s = await createSandbox({ fixture: 'clean-node' });
  expect((await s.af(['init', '--skills', 'diagnosing-bugs,filing-pr'])).code).toBe(0);
  expect((await s.af(['remove', '--all', '--keep-skills', '--yes'])).code).toBe(0);
  expect(exists(path.join(s.project, 'agileflow.lock'))).toBe(false);
  return s;
}

describe('add --adopt', () => {
  it('previews by default when not interactive and changes nothing without --yes', async () => {
    sb = await detachedProject();
    const before = read(path.join(sb.project, '.agents/skills/diagnosing-bugs/SKILL.md'));
    const res = await sb.af(['add', '--adopt']);
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Unmanaged skills found:');
    expect(res.stdout).toMatch(/diagnosing-bugs\s+\.agents\/skills\/diagnosing-bugs\s+identical to @agileflow\/diagnosing-bugs@/);
    expect(res.stdout).toContain('Preview only; nothing was changed. Rerun with --yes to adopt.');
    expect(exists(path.join(sb.project, 'agileflow.yaml'))).toBe(false);
    expect(read(path.join(sb.project, '.agents/skills/diagnosing-bugs/SKILL.md'))).toBe(before);

    const json = JSON.parse((await sb.af(['add', '--adopt', '--json'])).stdout);
    expect(json).toMatchObject({ schema: 1, ok: true, command: 'add', dryRun: true, adopt: true, applied: [] });
    expect(json.skipped).toEqual(
      expect.arrayContaining([{ id: 'diagnosing-bugs', reason: 'needs confirmation (--yes)' }]),
    );
    expect(json.plan.find((p: { id: string }) => p.id === 'filing-pr')).toMatchObject({ match: 'exact', ownership: 'managed', location: 'canonical' });
  });

  it('adopts identical copies as managed, edited copies as locally owned, and keeps every edit', async () => {
    sb = await detachedProject();
    const edited = path.join(sb.project, '.agents/skills/filing-pr/SKILL.md');
    fs.appendFileSync(edited, '\n## Team rule\n\nAlways link the ticket.\n');
    const editedText = read(edited);
    const res = await sb.af(['add', '--adopt', '--yes', '--json']);
    expect(res.code, res.stderr).toBe(0);
    const json = JSON.parse(res.stdout);
    expect(json.applied.map((a: { id: string; ownership: string }) => [a.id, a.ownership])).toEqual([
      ['diagnosing-bugs', 'managed'],
      ['filing-pr', 'local'],
    ]);
    const lock = lockOf(sb);
    expect(lock.resolved['diagnosing-bugs']).toMatchObject({ source: '@agileflow/diagnosing-bugs', ownership: 'managed' });
    expect(lock.resolved['filing-pr']).toMatchObject({ source: '.agents/skills/filing-pr', version: 'local', ownership: 'local' });
    const config = configOf(sb);
    expect(config.skills['filing-pr'].provenance.forkedFrom).toMatch(/^@agileflow\/filing-pr@\d/);
    expect(read(edited)).toBe(editedText);
    // The managed copy is back in AgileFlow's rendered form; a backup of the pre-adoption copy exists.
    expect(read(path.join(sb.project, '.agents/skills/diagnosing-bugs/SKILL.md'))).toContain('Managed by AgileFlow');
    expect(json.backupDir).toBeTruthy();
    expect(exists(path.join(json.backupDir, 'agents/skills/diagnosing-bugs/SKILL.md'))).toBe(true);
    // The result is a healthy, clean project.
    const check = JSON.parse((await sb.af(['check', '--json'])).stdout);
    expect(check.ok ?? check.healthy).not.toBe(false);
    const again = JSON.parse((await sb.af(['add', '--adopt', '--json'])).stdout);
    expect(again.plan).toEqual([]);
  });

  it('moves a skill that only exists in .claude/skills into .agents/skills (with a backup) and links it back', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--skills', '']);
    writeSkill(path.join(sb.project, '.claude/skills/deploy-notes'), 'deploy-notes', 'Write deploy notes.');
    const prompter = scriptedPrompter([true]);
    const res = await sb.af(['add', '--adopt', 'deploy-notes'], { prompter });
    expect(res.code, res.stderr).toBe(0);
    expect(prompter.asked).toEqual(['Adopt deploy-notes (1 moved or rewritten, backed up first)?']);
    expect(res.stdout).toContain('move to .agents/skills/deploy-notes and link it back');
    expect(read(path.join(sb.project, '.agents/skills/deploy-notes/SKILL.md'))).toContain('Write deploy notes.');
    expect(isSymlink(path.join(sb.project, '.claude/skills/deploy-notes'))).toBe(true);
    expect(read(path.join(sb.project, '.claude/skills/deploy-notes/SKILL.md'))).toContain('Write deploy notes.');
    // The backup is in this machine's cache, never in the repository.
    expect(fs.readdirSync(sb.project).filter((n) => n.includes('backup'))).toEqual([]);
    const where = /Backup of moved or rewritten directories: (.+)/.exec(res.stdout)![1]!;
    expect(where.startsWith(sb.cache)).toBe(true);
    expect(exists(path.join(where, 'claude/skills/deploy-notes/SKILL.md'))).toBe(true);
    expect(lockOf(sb).resolved['deploy-notes']).toMatchObject({ ownership: 'local' });
  });

  it('never moves a skill out of a provider directory that is disabled (it would get no link back)', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--skills', '']);
    expect((await sb.af(['configure', 'provider', 'claude', 'off'])).code).toBe(0);
    writeSkill(path.join(sb.project, '.claude/skills/my-helper'), 'my-helper', 'Help me.');
    const res = await sb.af(['add', '--adopt', '--yes', '--json']);
    expect(res.code).toBe(0);
    const json = JSON.parse(res.stdout);
    expect(json.applied).toEqual([]);
    expect(json.skipped).toEqual([{ id: 'my-helper', reason: expect.stringContaining('claude is disabled or not detected') }]);
    expect(read(path.join(sb.project, '.claude/skills/my-helper/SKILL.md'))).toContain('Help me.');
    expect(exists(path.join(sb.project, '.agents/skills/my-helper'))).toBe(false);
  });

  it('asks before changing anything and leaves everything alone when declined', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--skills', '']);
    writeSkill(path.join(sb.project, '.claude/skills/deploy-notes'), 'deploy-notes', 'Write deploy notes.');
    const res = await sb.af(['add', '--adopt'], { prompter: scriptedPrompter([false]) });
    expect(res.code).toBe(0);
    expect(res.stdout).toContain('Nothing changed.');
    expect(exists(path.join(sb.project, '.agents/skills/deploy-notes'))).toBe(false);
    expect(isSymlink(path.join(sb.project, '.claude/skills/deploy-notes'))).toBe(false);
  });

  it('a Claude-only skill named like an official one is adopted as locally owned, never as the official package', async () => {
    sb = await createSandbox({ fixture: 'existing-claude-skills' });
    const original = read(path.join(sb.project, '.claude/skills/diagnosing-bugs/SKILL.md'));
    const res = await sb.af(['add', '--adopt', '--yes', '--json']);
    expect(res.code, res.stderr).toBe(0);
    const json = JSON.parse(res.stdout);
    const plan = Object.fromEntries(json.plan.map((p: { id: string }) => [p.id, p]));
    expect(plan['diagnosing-bugs']).toMatchObject({ match: 'unknown', ownership: 'local', source: '@agileflow/diagnosing-bugs', move: true });
    expect(plan['my-claude-only-skill']).toMatchObject({ match: 'unknown', ownership: 'local', move: true });
    expect(lockOf(sb).resolved['diagnosing-bugs']).toMatchObject({ ownership: 'local', version: 'local' });
    expect(configOf(sb).skills['diagnosing-bugs']).toEqual({ source: '.agents/skills/diagnosing-bugs' });
    expect(read(path.join(sb.project, '.agents/skills/diagnosing-bugs/SKILL.md'))).toBe(original);
    expect(read(path.join(sb.project, '.claude/skills/diagnosing-bugs/SKILL.md'))).toBe(original);
    expect(isSymlink(path.join(sb.project, '.claude/skills/diagnosing-bugs'))).toBe(true);
  });

  it('reports what cannot be adopted and rejects ids that are not unmanaged skills', async () => {
    sb = await createSandbox({ fixture: 'clean-node' });
    await sb.af(['init', '--skills', 'diagnosing-bugs']);
    fs.mkdirSync(path.join(sb.project, '.agents/skills/broken'), { recursive: true });
    fs.writeFileSync(path.join(sb.project, '.agents/skills/broken/SKILL.md'), 'no frontmatter\n');
    const res = await sb.af(['add', '--adopt', '--dry-run', '--json']);
    const json = JSON.parse(res.stdout);
    expect(json.skipped).toEqual([{ id: 'broken', reason: expect.stringContaining('SKILL.md is invalid') }]);
    const managed = await sb.af(['add', '--adopt', 'diagnosing-bugs']);
    expect(managed.code).toBe(1);
    expect(managed.stderr).toContain('diagnosing-bugs is already managed by AgileFlow');
    const missing = await sb.af(['add', '--adopt', 'nope', '--json']);
    expect(missing.code).toBe(1);
    expect(JSON.parse(missing.stdout)).toMatchObject({ ok: false, error: { code: 'usage' } });
    expect(missing.stderr).toBe('');
  });
});
