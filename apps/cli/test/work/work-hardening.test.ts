import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { read } from '../helpers';
import { create, json, sandbox, workSandbox } from './helpers';

const STORIES = 'docs/agile/03-stories';

describe('work status on non-canonical frontmatter', () => {
  it('quoted keys and flow mappings are changed in place; the item stays valid', async () => {
    const sb = await workSandbox();
    const quoted = path.join(sb.project, STORIES, 'STORY-AAAAAAA9-q.md');
    const flow = path.join(sb.project, STORIES, 'STORY-AAAAAAA8-f.md');
    fs.mkdirSync(path.dirname(quoted), { recursive: true });
    fs.writeFileSync(quoted, '---\r\nschema: 1\r\ntype: story\r\nid: STORY-AAAAAAA9\r\ntitle: q\r\n"status": backlog  # was triaged\r\n---\r\n\r\n# q\r\n');
    fs.writeFileSync(flow, '---\n{schema: 1, type: story, id: STORY-AAAAAAA8, title: f, status: backlog}\n---\n\n# f\n');
    expect((await sb.af(['work', 'status', 'AAAAAAA9', 'ready'])).stdout).toBe('STORY-AAAAAAA9\nbacklog -> ready\n');
    expect((await sb.af(['work', 'status', 'AAAAAAA8', 'ready'])).code).toBe(0);
    expect(read(quoted)).toBe('---\r\nschema: 1\r\ntype: story\r\nid: STORY-AAAAAAA9\r\ntitle: q\r\n"status": ready  # was triaged\r\n---\r\n\r\n# q\r\n');
    expect(read(flow)).toBe('---\n{schema: 1, type: story, id: STORY-AAAAAAA8, title: f, status: ready}\n---\n\n# f\n');
    const listed = await json<Array<{ id: string; status: string }>>(sb, ['work', 'list']);
    expect(listed.map((s) => `${s.id} ${s.status}`).sort()).toEqual(['STORY-AAAAAAA8 ready', 'STORY-AAAAAAA9 ready']);
    expect((await sb.af(['check'])).code).toBe(0);
  });
});

describe('duplicate IDs', () => {
  it('status and show refuse and list both files; nothing is written', async () => {
    const sb = await workSandbox();
    const id = await create(sb, 'story', 'One');
    const dir = path.join(sb.project, STORIES);
    const [original] = fs.readdirSync(dir);
    fs.copyFileSync(path.join(dir, original!), path.join(dir, `${id}-copy.md`));
    const before = [read(path.join(dir, original!)), read(path.join(dir, `${id}-copy.md`))];
    const res = await sb.af(['work', 'status', id.slice(6, 10), 'in-progress']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain(`${id} is used by 2 work items (duplicate ID)`);
    expect(res.stderr).toContain(`${STORIES}/${id}-copy.md`);
    expect(res.stderr).toContain(`${STORIES}/${original}`);
    expect([read(path.join(dir, original!)), read(path.join(dir, `${id}-copy.md`))]).toEqual(before);
    expect((await sb.af(['work', 'show', id])).code).toBe(1);
    expect((await sb.af(['work', 'new', 'story', '--title', 'Dep', '--depends-on', id])).stderr).toContain('duplicate ID');
    const check = await sb.af(['check']);
    expect(check.code).toBe(1);
    expect(check.stdout).toContain(`[x] duplicate story id ${id} (2 files)`);
  });
});

describe('--json errors', () => {
  it('are JSON on stdout with exit 1, for Work errors and usage errors alike', async () => {
    const sb = await sandbox('agile-app');
    const bad = await sb.af(['work', 'status', 'R3N7', 'bogus', '--json']);
    expect(bad.code).toBe(1);
    expect(bad.stderr).toBe('');
    expect(JSON.parse(bad.stdout)).toEqual({
      ok: false,
      error: { message: '"bogus" is not a story status', hints: ['Valid: backlog, ready, in-progress, in-review, blocked, done, cancelled'] },
    });
    const missing = JSON.parse((await sb.af(['work', 'show', 'ZZZZ', '--json'])).stdout);
    expect(missing).toEqual({ ok: false, error: { message: 'No work item matches "ZZZZ"', hints: ['List items with `agileflow work list`.'] } });
    const type = JSON.parse((await sb.af(['work', 'list', '--type', 'bug', '--json'])).stdout);
    expect(type.error.message).toBe('--type must be epic, story, or decision (got "bug")');

    const plain = await sandbox();
    const off = await plain.af(['work', 'board', '--json']);
    expect(off.code).toBe(1);
    expect(JSON.parse(off.stdout)).toEqual({
      ok: false,
      error: {
        message: 'AgileFlow Work is not enabled in this project',
        hints: ['Run `agileflow work init` to set up the Agile workspace (docs/agile by default).'],
      },
    });
  });

  it('text mode keeps errors on stderr', async () => {
    const sb = await sandbox('agile-app');
    const bad = await sb.af(['work', 'status', 'R3N7', 'bogus']);
    expect(bad.code).toBe(1);
    expect(bad.stdout).toBe('');
    expect(bad.stderr).toContain('error: "bogus" is not a story status');
  });
});

describe('work list --type plural and --ready', () => {
  it('accepts stories/epics/decisions', async () => {
    const sb = await sandbox('agile-app');
    const stories = await json<Array<{ type: string }>>(sb, ['work', 'list', '--type', 'stories']);
    expect(stories.map((s) => s.type)).toEqual(['story', 'story']);
    expect((await json<Array<{ type: string }>>(sb, ['work', 'list', '--type', 'Epics'])).every((e) => e.type === 'epic')).toBe(true);
  });

  it('--ready lists stories that can start now; list/show/board JSON expose readiness', async () => {
    const sb = await workSandbox();
    const epic = await create(sb, 'epic', 'E', '--status', 'active', '--horizon', 'now');
    const done = await create(sb, 'story', 'Done dep', '--status', 'done', '--epic', epic);
    const wip = await create(sb, 'story', 'Wip dep', '--status', 'in-progress', '--epic', epic);
    const go = await create(sb, 'story', 'Go', '--status', 'ready', '--depends-on', done, '--epic', epic);
    const wait = await create(sb, 'story', 'Wait', '--status', 'ready', '--depends-on', wip, '--epic', epic);
    const later = await create(sb, 'story', 'Later', '--priority', 'p0');

    const ready = await json<Array<Record<string, unknown>>>(sb, ['work', 'list', '--ready']);
    expect(ready.map((s) => s.id)).toEqual([go, later]);
    expect(ready[0]).toMatchObject({ id: go, depends_on: [done], dependenciesDone: true, waitingOn: [], ready: true });
    const text = await sb.af(['work', 'list', '--ready']);
    expect(text.stdout).toMatch(/^Ready to start\n/);
    expect(text.stdout).not.toContain(wait);
    expect((await json<unknown[]>(sb, ['work', 'list', '--ready', '--epic', epic])).length).toBe(1);
    expect((await sb.af(['work', 'list', '--ready', '--type', 'epic'])).stderr).toContain('--ready lists stories');

    const shown = await json<Record<string, unknown>>(sb, ['work', 'show', wait]);
    expect(shown).toMatchObject({ dependenciesDone: false, waitingOn: [wip], ready: false });
    expect((await sb.af(['work', 'show', wait])).stdout).toContain(`Can start: no, waiting on ${wip}`);
    const board = await json<{ readyToStart: string[]; groups: Array<{ epics: Array<{ columns: Array<{ stories: Array<Record<string, unknown>> }> }> }> }>(sb, [
      'work',
      'board',
    ]);
    expect(board.readyToStart).toEqual([go, later]);
    const waitCard = board.groups[0]!.epics[0]!.columns.flatMap((c) => c.stories).find((s) => s.id === wait);
    expect(waitCard).toMatchObject({ epic: epic, depends_on: [wip], dependenciesDone: false, waitingOn: [wip], ready: false });
    expect(String(waitCard!.path)).toMatch(new RegExp(`^${STORIES}/${wait}-wait\\.md$`));
  });
});

describe('terminal output safety', () => {
  it('control characters in titles are replaced in text output and kept (escaped) in JSON', async () => {
    const sb = await workSandbox();
    const title = 'esc \u001b[31mRED\u001b[0m\u0007';
    const id = await create(sb, 'story', title, '--status', 'ready');
    for (const args of [['work', 'list'], ['work', 'show', id, '--body'], ['work', 'board']]) {
      const res = await sb.af(args);
      expect(res.stdout, args.join(' ')).not.toMatch(/[\u0000-\u0008\u000b-\u001f]/);
      expect(res.stdout, args.join(' ')).toContain('esc ?[31mRED?[0m?');
    }
    expect((await json<{ title: string }>(sb, ['work', 'show', id])).title).toBe(title);
  });
});

describe('work init and .gitignore', () => {
  it('warns when the workspace would be ignored by Git, and still sets it up', async () => {
    const sb = await sandbox();
    fs.writeFileSync(path.join(sb.project, '.gitignore'), 'node_modules\n/docs/\n');
    const res = await sb.af(['work', 'init', '--yes', '--no-skills']);
    expect(res.code).toBe(0);
    expect(res.stderr).toContain('warning: docs/agile/ is ignored by Git (.gitignore:2: /docs/)');
    expect(res.stderr).toContain('use `/docs/*` plus `!/docs/agile/`');
    expect(fs.existsSync(path.join(sb.project, 'docs/agile/README.md'))).toBe(true);

    const other = await sandbox();
    fs.writeFileSync(path.join(other.project, '.gitignore'), 'planning/\n');
    const data = await json<{ warnings: string[] }>(other, ['work', 'init', '--yes', '--no-skills', '--root', 'planning']);
    expect(data.warnings).toHaveLength(1);
    expect(data.warnings[0]).toContain('planning/ is ignored by Git (.gitignore:1: planning/)');

    const clean = await sandbox();
    const ok = await clean.af(['work', 'init', '--yes', '--no-skills']);
    expect(ok.stderr).toBe('');
    expect((await json<{ warnings: string[] }>(await sandbox(), ['work', 'init', '--yes', '--no-skills'])).warnings).toEqual([]);
  });
});
