import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { create, json, sandbox, workSandbox } from './helpers';

describe('agileflow work board', () => {
  it('derives the board from frontmatter: horizon, epic, status, standalone', async () => {
    const sb = await workSandbox();
    const now = await create(sb, 'epic', 'Social authentication', '--horizon', 'now', '--status', 'active', '--priority', 'p1');
    await create(sb, 'epic', 'Offline mode', '--horizon', 'later');
    const abstraction = await create(sb, 'story', 'Auth provider abstraction', '--epic', now, '--status', 'in-progress', '--priority', 'p1');
    const google = await create(sb, 'story', 'Google sign-in', '--epic', now, '--status', 'ready', '--priority', 'p1', '--depends-on', abstraction);
    const apple = await create(sb, 'story', 'Apple sign-in', '--epic', now, '--status', 'blocked', '--priority', 'p2');
    await create(sb, 'story', 'Done story', '--epic', now, '--status', 'done');
    const invoice = await create(sb, 'story', 'Fix invoice email', '--status', 'ready', '--priority', 'p1');

    const res = await sb.af(['work', 'board']);
    expect(res.code).toBe(0);
    const lines = res.stdout.split('\n').map((l) => l.replace(/\s+$/, ''));
    const at = (text: string) => lines.findIndex((l) => l.includes(text));
    expect(lines[0]).toBe('AGILEFLOW WORK');
    expect(lines[1]).toBe('NOW');
    expect(lines[2]).toMatch(new RegExp(`^${now}  Social authentication\\s+active\\s+1/4 done$`));
    expect(at('  READY')).toBeLessThan(at(google));
    expect(at(google)).toBeLessThan(at('  IN PROGRESS'));
    expect(at('  IN PROGRESS')).toBeLessThan(at(abstraction));
    expect(at('  BLOCKED')).toBeLessThan(at(apple));
    expect(lines[at(google)]).toMatch(/^ {4}STORY-\w{8}  Google sign-in\s+p1$/);
    expect(at('LATER')).toBeGreaterThan(at(apple));
    expect(at('STANDALONE')).toBeGreaterThan(at('Offline mode'));
    expect(at(invoice)).toBeGreaterThan(at('STANDALONE'));
    expect(res.stdout).not.toContain('Done story');
    expect(res.stdout).toContain(`! ${google} Google sign-in is marked ready\n  but depends on ${abstraction} Auth provider abstraction (in-progress)`);
  });

  it('writes nothing: no board file, no state file', async () => {
    const sb = await sandbox('agile-app');
    const git = (...args: string[]) => execFileSync('git', args, { cwd: sb.project, encoding: 'utf8' });
    git('add', '-A');
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'fixture');
    await sb.af(['work', 'board']);
    await sb.af(['work', 'board', '--json']);
    await sb.af(['work', 'list']);
    await sb.af(['work', 'show', 'W5K8']);
    expect(git('status', '--porcelain')).toBe('');
  });

  it('--json exposes the same structure for agents', async () => {
    const sb = await sandbox('agile-app');
    const board = await json<{
      groups: Array<{ horizon: string; epics: Array<{ id: string; columns: Array<{ status: string; stories: Array<{ id: string }> }> }> }>;
      standalone: unknown[];
      warnings: unknown[];
    }>(sb, ['work', 'board']);
    expect(board.groups.map((g) => g.horizon)).toEqual(['now', 'next']);
    expect(board.groups[0]!.epics[0]!.columns.map((c) => [c.status, c.stories.map((s) => s.id)])).toEqual([
      ['ready', ['STORY-R3N7M2QA']],
      ['in-review', ['STORY-M9V4C6TE']],
    ]);
    expect(board.standalone).toEqual([]);
    expect(board.warnings).toEqual([]);
  });

  it('an empty workspace says how to start', async () => {
    const sb = await workSandbox();
    expect((await sb.af(['work', 'board'])).stdout).toBe('AGILEFLOW WORK\nNo open work. Create an epic or story with `agileflow work new`.\n');
  });
});
