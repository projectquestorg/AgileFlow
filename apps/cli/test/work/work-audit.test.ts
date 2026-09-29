import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { Output } from '../../src/ui/output';
import { read } from '../helpers';
import { create, json, workSandbox } from './helpers';

const STORY = 'docs/agile/03-stories/STORY-AAAAAAA1.md';

async function storySandbox() {
  const sb = await workSandbox();
  fs.mkdirSync(path.join(sb.project, 'docs/agile/03-stories'), { recursive: true });
  fs.writeFileSync(
    path.join(sb.project, STORY),
    '---\nschema: 1\ntype: story\nid: STORY-AAAAAAA1\ntitle: Rename\nstatus: in-progress\n---\n\n# Rename\n\n## Acceptance Criteria\n\n- [ ] One\n- [ ] Two\n',
  );
  fs.mkdirSync(path.join(sb.project, 'src'), { recursive: true });
  fs.writeFileSync(path.join(sb.project, 'src/workspaces.js'), 'module.exports = 1;\n');
  fs.writeFileSync(path.join(sb.project, 'workspaces.js'), 'root copy\n');
  return sb;
}

describe('work evidence paths', () => {
  it('resolves --file and --ref against the current directory and stores project-relative POSIX keys', async () => {
    const sb = await storySandbox();
    const src = path.join(sb.project, 'src');
    const rec = await json<{ record: { files: Record<string, string> } }>(sb, ['work', 'evidence', 'AAAAAAA1', '--criterion', '1', '--kind', 'manual', '--ref', 'x', '--file', 'workspaces.js']);
    expect(Object.keys(rec.record.files)).toEqual(['workspaces.js']);
    const fromSrc = await sb.af(['work', 'evidence', 'AAAAAAA1', '--criterion', '2', '--kind', 'test', '--ref', 'workspaces.js:1', '--file', path.join(src, 'workspaces.js'), '--json'], { cwd: src });
    expect(fromSrc.code).toBe(0);
    // Both the relative ref (from src/) and the absolute --file become `src/workspaces.js`.
    expect(Object.keys(JSON.parse(fromSrc.stdout).record.files)).toEqual(['src/workspaces.js']);
    expect(read(path.join(sb.project, STORY))).not.toContain(sb.project);

    // Editing src/workspaces.js makes criterion 2 stale (not the root copy).
    fs.writeFileSync(path.join(src, 'workspaces.js'), 'module.exports = 2;\n');
    const shown = await json<{ evidence: { criteria: Array<{ status: string }> } }>(sb, ['work', 'show', 'AAAAAAA1']);
    expect(shown.evidence.criteria.map((c) => c.status)).toEqual(['verified', 'stale']);

    const outside = await sb.af(['work', 'evidence', 'AAAAAAA1', '--criterion', '1', '--kind', 'manual', '--ref', 'x', '--file', '../../etc/hostname'], { cwd: src });
    expect(outside.stderr).toContain('is outside the project');
  });

  it('refuses a --file symlink that points outside the project', async () => {
    const sb = await storySandbox();
    const secret = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'af-out-')), 'secret.txt');
    fs.writeFileSync(secret, 'secret\n');
    fs.symlinkSync(secret, path.join(sb.project, 'src/outside'));
    const res = await sb.af(['work', 'evidence', 'AAAAAAA1', '--criterion', '1', '--kind', 'manual', '--ref', 'x', '--file', 'src/outside']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('--file src/outside is not a readable file in the project');
    expect(read(path.join(sb.project, STORY))).not.toContain('agileflow-evidence');
    fs.rmSync(path.dirname(secret), { recursive: true, force: true });
  });
});

describe('concurrent Work changes', () => {
  it('run under the project lock: no evidence record or status change is lost', async () => {
    const sb = await storySandbox();
    const results = await Promise.all([
      sb.af(['work', 'evidence', 'AAAAAAA1', '--criterion', '1', '--kind', 'manual', '--ref', 'r1']),
      sb.af(['work', 'evidence', 'AAAAAAA1', '--criterion', '2', '--kind', 'manual', '--ref', 'r2']),
      sb.af(['work', 'status', 'AAAAAAA1', 'in-review']),
    ]);
    expect(results.map((r) => r.code)).toEqual([0, 0, 0]);
    const text = read(path.join(sb.project, STORY));
    expect(text).toContain('ref: r1');
    expect(text).toContain('ref: r2');
    expect(text).toContain('status: in-review');
    const ids = await Promise.all(Array.from({ length: 5 }, (_, i) => create(sb, 'story', `S${i}`)));
    expect(new Set(ids).size).toBe(5);
  });
});

describe('error output', () => {
  it('Work errors carry the same codes as other commands and never print raw control characters', async () => {
    const sb = await workSandbox();
    const id = await create(sb, 'story', 'One');
    const dir = path.join(sb.project, 'docs/agile/03-stories');
    const [original] = fs.readdirSync(dir);
    fs.copyFileSync(path.join(dir, original!), path.join(dir, `${id}-\u001b[31mred.md`));
    const res = await sb.af(['work', 'status', id, 'ready']);
    expect(res.code).toBe(1);
    expect(res.stderr).toContain('duplicate ID');
    expect(res.stderr).toContain('?[31mred.md');
    expect(res.stderr).not.toMatch(/[\u0000-\u0008\u000b-\u001f]/);
    expect(JSON.parse((await sb.af(['work', 'status', id, 'ready', '--json'])).stdout).error.code).toBe('error');
    expect(JSON.parse((await sb.af(['work', 'new', 'task', '--title', 'x', '--json'])).stdout).error.code).toBe('usage');
  });

  it('a closed stdout pipe (EPIPE) ends quietly', () => {
    const stream = Object.assign(new EventEmitter(), { write: () => true, isTTY: false });
    new Output(stream, { write: () => true });
    expect(() => stream.emit('error', Object.assign(new Error('write EPIPE'), { code: 'EPIPE' }))).not.toThrow();
    expect(() => stream.emit('error', Object.assign(new Error('boom'), { code: 'EIO' }))).toThrow('boom');
  });

  it('piping to head does not crash the built CLI', () => {
    const bin = path.join(__dirname, '../../bin/agileflow.js');
    if (!fs.existsSync(path.join(__dirname, '../../dist/cli.js'))) return;
    const out = execFileSync('bash', ['-c', `node ${JSON.stringify(bin)} --help | head -c 10 >/dev/null; echo "\${PIPESTATUS[0]}"`], { encoding: 'utf8' });
    expect(out.trim()).toBe('0');
  });
});
