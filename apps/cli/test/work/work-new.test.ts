import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { read } from '../helpers';
import { create, json, workSandbox } from './helpers';

const frontmatterOf = (file: string) => YAML.parse(read(file).split('---')[1]!);

describe('agileflow work new', () => {
  it('creates an epic and prints the id and path', async () => {
    const sb = await workSandbox();
    const res = await sb.af(['work', 'new', 'epic', '--title', 'Social authentication']);
    expect(res.code).toBe(0);
    const [created, file] = res.stdout.trim().split('\n');
    expect(created).toMatch(/^Created EPIC-[0-9A-HJKMNP-TV-Z]{8}$/);
    const id = created!.replace('Created ', '');
    expect(file).toBe(`docs/agile/02-epics/${id}-social-authentication.md`);
    expect(frontmatterOf(path.join(sb.project, file!))).toEqual({ schema: 1, type: 'epic', id, title: 'Social authentication', status: 'proposed' });
  });

  it('creates epic-linked stories (partial epic id) and standalone stories; --json for agents', async () => {
    const sb = await workSandbox();
    const epic = await create(sb, 'epic', 'Social authentication', '--horizon', 'now', '--priority', 'p1');
    const out = await json<{ id: string; type: string; path: string }>(sb, ['work', 'new', 'story', '--epic', epic.slice(5, 9), '--title', 'Add Google sign-in']);
    expect(Object.keys(out)).toEqual(['id', 'type', 'path']);
    expect(out).toMatchObject({ type: 'story', path: `docs/agile/03-stories/${out.id}-add-google-sign-in.md` });
    expect(frontmatterOf(path.join(sb.project, out.path))).toEqual({
      schema: 1,
      type: 'story',
      id: out.id,
      title: 'Add Google sign-in',
      status: 'backlog',
      epic,
      depends_on: [],
    });
    const standalone = await json<{ path: string }>(sb, ['work', 'new', 'story', '--title', 'Fix duplicate invoice email', '--priority', 'p1', '--status', 'ready']);
    const fm = frontmatterOf(path.join(sb.project, standalone.path));
    expect(fm.epic).toBeUndefined();
    expect(fm).toMatchObject({ status: 'ready', priority: 'p1' });
    expect((await sb.af(['check'])).code).toBe(0);
  });

  it('records dependencies and decision relations by full or partial id', async () => {
    const sb = await workSandbox();
    const a = await create(sb, 'story', 'Auth provider abstraction');
    const b = await create(sb, 'story', 'Google sign-in');
    const c = await create(sb, 'story', 'Account linking', '--depends-on', `${a.slice(6, 10)},${b}`);
    const d = await create(sb, 'decision', 'Use Auth.js', '--related', c);
    const show = await json<{ depends_on: string[] }>(sb, ['work', 'show', c]);
    expect(show.depends_on).toEqual([a, b]);
    expect((await json<{ related: Array<{ id: string }> }>(sb, ['work', 'show', d])).related.map((r) => r.id)).toEqual([c]);
  });

  it('rejects invalid input and writes nothing', async () => {
    const sb = await workSandbox();
    const cases: Array<[string[], string]> = [
      [['work', 'new', 'task', '--title', 'x'], 'Unknown work type "task"'],
      [['work', 'new', 'story', '--title', 'x', '--epic', 'EPIC-ZZZZ'], 'No epic work item matches "EPIC-ZZZZ"'],
      [['work', 'new', 'story', '--title', 'x', '--priority', 'urgent'], '"urgent" is not a valid priority'],
      [['work', 'new', 'story', '--title', 'x', '--status', 'grooming'], '"grooming" is not a story status'],
      [['work', 'new', 'story', '--title', 'x', '--horizon', 'now'], '--horizon applies to epics only'],
      [['work', 'new', 'story', '--title', '   '], '--title is required'],
    ];
    for (const [args, message] of cases) {
      const res = await sb.af(args);
      expect(res.code, args.join(' ')).toBe(1);
      expect(res.stderr, args.join(' ')).toContain(message);
    }
    expect((await sb.af(['work', 'new', 'story'])).code).toBe(1); // --title missing
    expect(fs.existsSync(path.join(sb.project, 'docs/agile/03-stories'))).toBe(false);
  });

  it('parallel branches create items without a shared counter or merge conflicts', async () => {
    const sb = await workSandbox();
    const main = path.join(sb.project, 'docs/agile');
    // Two "branches": copies of the same workspace, each creating stories independently.
    const branchA = path.join(sb.root, 'branch-a');
    const branchB = path.join(sb.root, 'branch-b');
    for (const b of [branchA, branchB]) {
      fs.cpSync(sb.project, b, { recursive: true });
    }
    const idsA = await Promise.all(Array.from({ length: 10 }, (_, i) => sb.af(['work', 'new', 'story', '--title', `A${i}`, '--json'], { cwd: branchA })));
    const idsB = await Promise.all(Array.from({ length: 10 }, (_, i) => sb.af(['work', 'new', 'story', '--title', `B${i}`, '--json'], { cwd: branchB })));
    // Merge: copy both branches' story files into main.
    fs.mkdirSync(path.join(main, '03-stories'), { recursive: true });
    const merged: string[] = [];
    for (const b of [branchA, branchB]) {
      for (const f of fs.readdirSync(path.join(b, 'docs/agile/03-stories'))) {
        expect(fs.existsSync(path.join(main, '03-stories', f)), `conflict on ${f}`).toBe(false);
        fs.copyFileSync(path.join(b, 'docs/agile/03-stories', f), path.join(main, '03-stories', f));
        merged.push(f);
      }
    }
    expect(merged).toHaveLength(20);
    const ids = [...idsA, ...idsB].map((r) => JSON.parse(r.stdout).id);
    expect(new Set(ids).size).toBe(20);
    const check = await sb.af(['check']);
    expect(check.stdout).toContain('[ok] 20 stories');
    expect(check.stdout).toContain('[ok] no duplicate IDs');
  });
});
