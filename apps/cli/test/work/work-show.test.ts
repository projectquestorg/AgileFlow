import { describe, expect, it } from 'vitest';
import { create, json, sandbox, workSandbox } from './helpers';

describe('agileflow work show', () => {
  it('shows a story by partial id with derived relationships and criteria progress', async () => {
    const sb = await sandbox('agile-app');
    const res = await sb.af(['work', 'show', 'r3n7']);
    expect(res.code).toBe(0);
    expect(res.stdout).toBe(
      [
        'STORY-R3N7M2QA',
        'Let owners rename a workspace',
        'Status:    ready',
        'Priority:  p1',
        'Epic:      EPIC-W5K8R2QT  Workspace management',
        'Dependencies:',
        '  none',
        'Decisions:',
        '  DEC-P3M9A6HD  Owner and member are the only workspace roles  (accepted)',
        'Acceptance Criteria:',
        '  0 / 4 complete',
        'Path:      docs/agile/03-stories/STORY-R3N7M2QA-rename-workspace.md',
        '',
      ].join('\n'),
    );
    const withBody = await sb.af(['work', 'show', 'R3N7', '--body']);
    expect(withBody.stdout).toContain('## Acceptance Criteria\n\n- [ ] An owner can rename a workspace');
  });

  it('shows an epic with its stories derived from story.epic, grouped by status, and progress', async () => {
    const sb = await sandbox('agile-app');
    const res = await sb.af(['work', 'show', 'EPIC-W5K']);
    expect(res.stdout).toContain(
      [
        'EPIC-W5K8R2QT',
        'Workspace management',
        'Status:    active',
        'Priority:  p1',
        'Horizon:   now',
        'Stories',
        'READY',
        '  STORY-R3N7M2QA  Let owners rename a workspace  p1',
        'IN REVIEW',
        '  STORY-M9V4C6TE  Let members leave a workspace  p2',
        'Decisions',
        '  DEC-P3M9A6HD  Owner and member are the only workspace roles  (accepted)',
        'Progress',
        '  0 / 2 stories done',
      ].join('\n'),
    );
    const data = await json<{ stories: Array<{ id: string }>; progress: Record<string, number> }>(sb, ['work', 'show', 'W5K8']);
    expect(data.stories.map((s) => s.id)).toEqual(['STORY-R3N7M2QA', 'STORY-M9V4C6TE']);
    expect(data.progress).toEqual({ total: 2, done: 0, cancelled: 0, open: 2 });
  });

  it('shows dependencies, dependents, and decisions; --json includes the body', async () => {
    const sb = await workSandbox();
    const a = await create(sb, 'story', 'Auth provider abstraction', '--status', 'in-progress');
    const b = await create(sb, 'story', 'Google sign-in', '--depends-on', a);
    const d = await create(sb, 'decision', 'Use Auth.js', '--related', b);
    const story = await sb.af(['work', 'show', b]);
    expect(story.stdout).toContain(`Dependencies:\n  ${a}  Auth provider abstraction  (in-progress)`);
    expect(story.stdout).toContain(`Decisions:\n  ${d}  Use Auth.js  (proposed)`);
    expect((await sb.af(['work', 'show', a])).stdout).toContain(`Needed by:\n  ${b}  Google sign-in  (backlog)`);
    const data = await json<Record<string, unknown>>(sb, ['work', 'show', b]);
    expect(data).toMatchObject({ id: b, type: 'story', dependencies: [{ id: a, title: 'Auth provider abstraction', status: 'in-progress' }] });
    expect(String(data.body)).toContain('# Google sign-in');
    const dec = await sb.af(['work', 'show', d]);
    expect(dec.stdout).toContain(`Status:    proposed\nRelated:\n  ${b}  Google sign-in  (backlog)`);
  });

  it('refuses ambiguous and unknown ids', async () => {
    const sb = await sandbox('agile-app');
    const unknown = await sb.af(['work', 'show', 'ZZZZ']);
    expect(unknown.code).toBe(1);
    expect(unknown.stderr).toContain('No work item matches "ZZZZ"');
    const empty = await workSandbox();
    const ids = await Promise.all(Array.from({ length: 40 }, (_, i) => create(empty, 'story', `S${i}`)));
    const prefix = ids.map((id) => id.slice(6, 7)).find((c, i, all) => all.indexOf(c) !== i)!;
    const ambiguous = await empty.af(['work', 'show', prefix]);
    expect(ambiguous.code).toBe(1);
    expect(ambiguous.stderr).toMatch(/is ambiguous: it matches \d+ items/);
  });
});
