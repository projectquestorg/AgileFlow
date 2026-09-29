import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createContext, projectScope, scopeLockPath } from '@agileflow/core';
import { create, json, sandbox, workSandbox } from './helpers';

const STORIES = 'docs/agile/03-stories';

describe('.gitignore warnings in check and work new', () => {
  it('name the exact ignored path (a subfolder, not the whole workspace)', async () => {
    const sb = await workSandbox();
    fs.writeFileSync(path.join(sb.project, '.gitignore'), 'node_modules\ndocs/agile/03-stories/\n');
    const created = await sb.af(['work', 'new', 'story', '--title', 'Hidden']);
    expect(created.code).toBe(0);
    expect(created.stderr).toMatch(/warning: docs\/agile\/03-stories\/STORY-\w{8}-hidden\.md is ignored by Git \(\.gitignore:2: docs\/agile\/03-stories\/\), so it would not be committed or shared\./);
    const data = await json<{ warnings: string[] }>(sb, ['work', 'new', 'epic', '--title', 'Visible']);
    expect(data.warnings).toEqual([]);

    const check = await sb.af(['check']);
    expect(check.stdout).toContain('[!] docs/agile/03-stories/ is ignored by Git (.gitignore:2: docs/agile/03-stories/), so files there would not be committed or shared.');
    expect(check.stdout).not.toContain('docs/agile/ is ignored');
  });
});

describe('duplicate IDs on the board and in lists', () => {
  it('are marked and warned about, never silently shown twice', async () => {
    const sb = await workSandbox();
    const id = await create(sb, 'story', 'One', '--status', 'ready');
    const dir = path.join(sb.project, STORIES);
    const [original] = fs.readdirSync(dir);
    fs.copyFileSync(path.join(dir, original!), path.join(dir, `${id}-copy.md`));
    const files = [original!, `${id}-copy.md`].sort().map((f) => `${STORIES}/${f}`);
    const warning = `warning: ${id} is used by 2 files (duplicate ID): ${files.join(', ')}. Commands refuse to change it until every copy but one has a new ID.`;

    const board = await sb.af(['work', 'board']);
    expect(board.stderr).toContain(warning);
    expect(board.stdout.match(new RegExp(`${id}.*\\(duplicate ID\\)`, 'g'))).toHaveLength(2);
    const boardJson = await sb.af(['work', 'board', '--json']);
    expect(JSON.parse(boardJson.stdout).duplicates).toEqual([{ id, paths: files }]);
    expect(boardJson.stderr).toContain(warning);

    const list = await sb.af(['work', 'list']);
    expect(list.stderr).toContain(warning);
    expect(list.stdout).toContain('One  (duplicate ID)');
    const listed = await json<Array<Record<string, unknown>>>(sb, ['work', 'list']);
    expect(listed.map((s) => s.duplicateId)).toEqual([true, true]);
    // `next` never offers it.
    expect((await json<{ eligible: unknown[] }>(sb, ['work', 'next'])).eligible).toEqual([]);
  });
});

describe('work init runs under the project lock', () => {
  it('waits for (then refuses on) a concurrent command, changing nothing', async () => {
    const sb = await sandbox();
    const ctx = createContext({ cwd: sb.project, homeDir: sb.home, cacheDir: sb.cache, configDir: path.join(sb.home, '.config', 'agileflow'), env: sb.env });
    const lock = scopeLockPath(ctx, projectScope(sb.project));
    fs.mkdirSync(path.dirname(lock), { recursive: true });
    fs.writeFileSync(lock, JSON.stringify({ pid: process.pid, host: os.hostname(), command: 'agileflow update', at: 'earlier' }));
    const res = await sb.af(['work', 'init', '--yes', '--no-skills'], { env: { AGILEFLOW_LOCK_TIMEOUT: '0' } });
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('Another AgileFlow command is changing this project (agileflow update');
    expect(fs.existsSync(path.join(sb.project, 'agileflow.yaml'))).toBe(false);
    expect(fs.existsSync(path.join(sb.project, 'docs/agile'))).toBe(false);
    fs.rmSync(lock);
    expect((await sb.af(['work', 'init', '--yes', '--no-skills'])).code).toBe(0);
    expect(fs.existsSync(lock)).toBe(false);
  });
});

describe('usage errors with --json', () => {
  it('print one JSON document on stdout and no help text', async () => {
    const sb = await workSandbox();
    for (const args of [['work', 'new', 'story', '--json'], ['work', 'list', '--bogus', '--json'], ['work', 'nope', '--json']]) {
      const res = await sb.af(args);
      expect(res.code, args.join(' ')).toBe(1);
      expect(JSON.parse(res.stdout), args.join(' ')).toMatchObject({ ok: false, error: { code: 'usage' } });
      expect(res.stderr, args.join(' ')).not.toContain('Usage:');
    }
    // Without --json the help still follows the error.
    expect((await sb.af(['work', 'list', '--bogus'])).stderr).toContain('Usage: agileflow work list');
  });
});
