import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { read } from '../helpers';
import { create, json, sandbox, workSandbox } from './helpers';

const STORY = 'docs/agile/03-stories/STORY-R3N7M2QA-rename-workspace.md';

describe('agileflow work status', () => {
  it('changes only the status line', async () => {
    const sb = await sandbox('agile-app');
    const before = read(path.join(sb.project, STORY));
    const res = await sb.af(['work', 'status', 'R3N7', 'in-progress']);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe('STORY-R3N7M2QA\nready -> in-progress\n');
    expect(res.stderr).toBe('');
    expect(read(path.join(sb.project, STORY))).toBe(before.replace('status: ready', 'status: in-progress'));
  });

  it('moves a story through the documented lifecycle, including blocking and reopening', async () => {
    const sb = await workSandbox();
    const id = await create(sb, 'story', 'Lifecycle');
    const steps = ['ready', 'in-progress', 'blocked', 'in-progress', 'in-review', 'in-progress', 'in-review', 'done', 'in-progress', 'cancelled'];
    let from = 'backlog';
    for (const to of steps) {
      const change = await json<{ from: string; to: string; changed: boolean; warnings: string[] }>(sb, ['work', 'status', id, to]);
      expect(change, `${from} -> ${to}`).toMatchObject({ from, to, changed: true, warnings: [] });
      from = to;
    }
    expect((await json<{ status: string }>(sb, ['work', 'show', id])).status).toBe('cancelled');
  });

  it('allows off-path moves with a warning, and warns about premature done and incomplete dependencies', async () => {
    const sb = await sandbox('agile-app');
    const skip = await sb.af(['work', 'status', 'R3N7', 'done']);
    expect(skip.code).toBe(0);
    expect(skip.stdout).toContain('ready -> done');
    expect(skip.stderr).toContain('ready -> done is outside the recommended flow');
    expect(skip.stderr).toContain('4 acceptance criteria are still unchecked');

    const work = await workSandbox();
    const dep = await create(work, 'story', 'Dependency', '--status', 'in-progress');
    const story = await create(work, 'story', 'Dependent', '--depends-on', dep);
    const change = await json<{ warnings: string[] }>(work, ['work', 'status', story, 'ready']);
    expect(change.warnings).toEqual([`depends on ${dep} Dependency (in-progress)`]);
  });

  it('rejects invalid statuses and refuses to close an epic with unfinished stories unless forced', async () => {
    const sb = await sandbox('agile-app');
    const bad = await sb.af(['work', 'status', 'R3N7', 'grooming']);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toContain('"grooming" is not a story status');
    expect(bad.stderr).toContain('backlog, ready, in-progress, in-review, blocked, done, cancelled');
    expect((await sb.af(['work', 'status', 'W5K8', 'in-progress'])).stderr).toContain('"in-progress" is not an epic status');
    // --force only overrides "cannot close cleanly", never an invalid value.
    const forcedBad = await sb.af(['work', 'status', 'R3N7', 'grooming', '--force']);
    expect(forcedBad.code).toBe(1);
    expect(read(path.join(sb.project, STORY))).toContain('status: ready');

    const epic = path.join(sb.project, 'docs/agile/02-epics/EPIC-W5K8R2QT-workspace-management.md');
    const before = read(epic);
    const refused = await sb.af(['work', 'status', 'W5K8', 'done']);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain('EPIC-W5K8R2QT has unfinished stories: STORY-R3N7M2QA (ready), STORY-M9V4C6TE (in-review)');
    expect(read(epic)).toBe(before);

    await sb.af(['work', 'status', 'R3N7', 'cancelled']);
    await sb.af(['work', 'status', 'M9V4', 'done']);
    const closed = await sb.af(['work', 'status', 'W5K8', 'done']);
    expect(closed.code).toBe(0);
    expect(closed.stdout).toBe('EPIC-W5K8R2QT\nactive -> done\n');

    const other = await sandbox('agile-app');
    const forced = await other.af(['work', 'status', 'W5K8', 'done', '--force']);
    expect(forced.code).toBe(0);
    expect(forced.stderr).toContain('unfinished stories');
  });

  it('decisions and no-op changes', async () => {
    const sb = await sandbox('agile-app');
    expect((await sb.af(['work', 'status', 'P3M9', 'superseded'])).stdout).toBe('DEC-P3M9A6HD\naccepted -> superseded\n');
    const same = await sb.af(['work', 'status', 'P3M9', 'superseded']);
    expect(same.stdout).toBe('DEC-P3M9A6HD\nalready superseded\n');
    expect(fs.readdirSync(path.join(sb.project, 'docs/agile'))).toEqual(['00-product', '01-roadmap', '02-epics', '03-stories', '04-decisions', 'README.md']);
  });
});
