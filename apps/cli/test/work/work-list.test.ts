import { describe, expect, it } from 'vitest';
import { json, sandbox, workSandbox } from './helpers';

describe('agileflow work list', () => {
  it('lists epics by horizon, stories, and decisions', async () => {
    const sb = await sandbox('agile-app');
    const res = await sb.af(['work', 'list']);
    expect(res.code).toBe(0);
    const out = res.stdout;
    expect(out).toMatch(/^Epics\nNOW\n/);
    expect(out.indexOf('EPIC-W5K8R2QT')).toBeLessThan(out.indexOf('NEXT'));
    expect(out.indexOf('NEXT')).toBeLessThan(out.indexOf('EPIC-D8P2A6MW'));
    expect(out).toMatch(/EPIC-W5K8R2QT\s+active\s+p1\s+0\/2 done\s+Workspace management/);
    expect(out).toMatch(/STORY-R3N7M2QA\s+ready\s+p1\s+EPIC-W5K8R2QT\s+0\/4\s+Let owners rename a workspace/);
    expect(out).toMatch(/STORY-M9V4C6TE\s+in-review\s+p2/);
    expect(out).toMatch(/Decisions\n.*\n\s+DEC-P3M9A6HD\s+accepted\s+Owner and member are the only workspace roles/);
  });

  it('filters by type, status, and epic (partial id), and supports --json', async () => {
    const sb = await sandbox('agile-app');
    const epics = await sb.af(['work', 'list', '--type', 'epic']);
    expect(epics.stdout).not.toContain('STORY-');
    const ready = await json<Array<{ id: string }>>(sb, ['work', 'list', '--status', 'ready']);
    expect(ready.map((r) => r.id)).toEqual(['STORY-R3N7M2QA']);
    const inEpic = await json<Array<Record<string, unknown>>>(sb, ['work', 'list', '--epic', 'W5K8']);
    expect(inEpic.map((r) => r.id)).toEqual(['STORY-R3N7M2QA', 'STORY-M9V4C6TE']);
    expect(inEpic[0]).toEqual({
      id: 'STORY-R3N7M2QA',
      type: 'story',
      title: 'Let owners rename a workspace',
      status: 'ready',
      path: 'docs/agile/03-stories/STORY-R3N7M2QA-rename-workspace.md',
      priority: 'p1',
      epic: 'EPIC-W5K8R2QT',
      depends_on: [],
      acceptanceCriteria: { total: 4, checked: 0 },
      dependenciesDone: true,
      waitingOn: [],
      ready: true,
    });
    expect((await sb.af(['work', 'list', '--epic', 'W5K8'])).stdout).toContain('Stories in EPIC-W5K8R2QT');
    const decisions = await json<Array<{ type: string }>>(sb, ['work', 'list', '--type', 'decisions']);
    expect(decisions.map((d) => d.type)).toEqual(['decision']);
  });

  it('explains invalid filters and empty results', async () => {
    const sb = await sandbox('agile-app');
    const bad = await sb.af(['work', 'list', '--type', 'story', '--status', 'active']);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain('"active" is not a status of story');
    expect((await sb.af(['work', 'list', '--type', 'bug'])).code).toBe(1);
    expect((await sb.af(['work', 'list', '--status', 'blocked'])).stdout).toContain('No matching work items.');
    const empty = await workSandbox();
    expect((await empty.af(['work', 'list'])).stdout).toContain('No work items yet');
    expect(await json(empty, ['work', 'list'])).toEqual([]);
  });
});
