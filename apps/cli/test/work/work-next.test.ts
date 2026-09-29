import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { create, json, workSandbox } from './helpers';

describe('agileflow work next', () => {
  it('lists ready stories with every dependency done, best first, with reasons; read-only', async () => {
    const sb = await workSandbox();
    const epic = await create(sb, 'epic', 'Billing', '--status', 'active', '--horizon', 'now');
    const done = await create(sb, 'story', 'Done dep', '--status', 'done');
    const wip = await create(sb, 'story', 'Wip dep', '--status', 'in-progress');
    const a = await create(sb, 'story', 'Invoices', '--status', 'ready', '--priority', 'p1', '--epic', epic, '--depends-on', done);
    const b = await create(sb, 'story', 'Refunds', '--status', 'ready', '--priority', 'p2');
    const waits = await create(sb, 'story', 'Waits', '--status', 'ready', '--priority', 'p0', '--depends-on', wip);
    const idea = await create(sb, 'story', 'Idea', '--priority', 'p0');
    const before = fs.readdirSync(path.join(sb.project, 'docs/agile/03-stories')).map((f) => fs.readFileSync(path.join(sb.project, 'docs/agile/03-stories', f), 'utf8'));

    const res = await sb.af(['work', 'next']);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe(
      [
        'Next (2 of 2 eligible)',
        `  1. ${a}  p1  Invoices`,
        `     status is ready, priority p1; every dependency is done (${done}); epic ${epic} is active, horizon now`,
        `  2. ${b}  p2  Refunds`,
        '     status is ready, priority p2; no dependencies',
        '',
        'Nothing was assigned or started. Start one with `agileflow work status <id> in-progress`.',
        '',
      ].join('\n'),
    );
    const explained = await sb.af(['work', 'next', '--explain', '--limit', '1']);
    expect(explained.stdout).toContain(`Next (1 of 2 eligible)\n  1. ${a}`);
    expect(explained.stdout).toContain(`Not eligible (1 of 2)\n  ${waits}  ready  p0  Waits\n     waiting on ${wip} is in-progress`);

    const data = await json<{ eligible: Array<Record<string, unknown>>; totalEligible: number; notEligible: Array<Record<string, unknown>>; totalNotEligible: number }>(sb, [
      'work',
      'next',
      '--explain',
    ]);
    expect(data.totalEligible).toBe(2);
    expect(data.eligible[0]).toMatchObject({ id: a, status: 'ready', priority: 'p1', epic, depends_on: [done], unblocks: [], reasons: expect.any(Array) });
    expect(data.notEligible.map((s) => s.id)).toEqual([waits, idea]);
    expect(data.notEligible[1]!.reasons).toEqual(['status is backlog: refine it and set it to ready first']);
    expect(data.totalNotEligible).toBe(2);
    expect((await json<{ eligible: Array<{ id: string }> }>(sb, ['work', 'next', '--epic', epic.slice(5, 9)])).eligible.map((s) => s.id)).toEqual([a]);

    // Read-only: no file changed.
    const after = fs.readdirSync(path.join(sb.project, 'docs/agile/03-stories')).map((f) => fs.readFileSync(path.join(sb.project, 'docs/agile/03-stories', f), 'utf8'));
    expect(after).toEqual(before);

    const bad = await sb.af(['work', 'next', '--limit', '0', '--json']);
    expect(bad.code).toBe(1);
    expect(JSON.parse(bad.stdout).error.message).toBe('--limit must be a positive whole number (got "0")');
  });

  it('says so when nothing can start', async () => {
    const sb = await workSandbox();
    await create(sb, 'story', 'Idea');
    const res = await sb.af(['work', 'next']);
    expect(res.stdout).toContain('No story can be started now.\n1 open story is not eligible; `agileflow work next --explain` shows why.');
  });
});
