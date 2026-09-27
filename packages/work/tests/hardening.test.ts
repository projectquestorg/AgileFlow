import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  findDependencyCycles,
  findIgnoredWorkPaths,
  getArtifact,
  readyToStart,
  resolvePartialId,
  scanWorkspace,
  setStatus,
  storyReadiness,
  validateWorkspace,
  type Story,
} from '@agileflow/work';
import { epic, project, put, story } from './helpers';

describe('duplicate IDs are refused, never resolved by sort order', () => {
  it('resolvePartialId refuses an ID listed more than once', () => {
    expect(() => resolvePartialId('3Q7M', ['STORY-3Q7MX2PK', 'STORY-3Q7MX2PK'])).toThrow(/STORY-3Q7MX2PK is used by 2 work items \(duplicate ID\)/);
    expect(resolvePartialId('3Q7M', ['STORY-3Q7MX2PK', 'EPIC-3Q7MX2PK'], 'story')).toBe('STORY-3Q7MX2PK');
  });

  it('getArtifact lists the files, and setStatus never touches either copy', async () => {
    const { paths } = project();
    const a = put(paths, '03-stories/STORY-AAAAAAA1-one.md', story({ id: 'STORY-AAAAAAA1', title: 'One' }));
    const b = put(paths, '03-stories/STORY-AAAAAAA1-copy.md', story({ id: 'STORY-AAAAAAA1', title: 'Copy' }));
    const scan = await scanWorkspace(paths);
    let error: Error & { hints?: string[] } = new Error('none');
    try {
      getArtifact(scan, 'AAAAAAA1');
    } catch (err) {
      error = err as Error & { hints?: string[] };
    }
    expect(error.message).toMatch(/STORY-AAAAAAA1 is used by 2 work items/);
    expect(error.hints).toEqual(expect.arrayContaining(['docs/agile/03-stories/STORY-AAAAAAA1-copy.md', 'docs/agile/03-stories/STORY-AAAAAAA1-one.md']));
    const before = [fs.readFileSync(a, 'utf8'), fs.readFileSync(b, 'utf8')];
    expect(() => getArtifact(scan, 'STORY-AAAAAAA1')).toThrow(/duplicate ID/);
    expect([fs.readFileSync(a, 'utf8'), fs.readFileSync(b, 'utf8')]).toEqual(before);
    const v = validateWorkspace(scan);
    expect(v.issues.find((i) => i.message.startsWith('duplicate story id STORY-AAAAAAA1'))?.level).toBe('error');
  });
});

describe('setStatus on non-canonical frontmatter', () => {
  it('quoted keys and flow mappings are changed in place and stay valid', async () => {
    const { paths } = project();
    const quoted = put(paths, '03-stories/STORY-AAAAAAA9-q.md', '---\nschema: 1\ntype: story\nid: STORY-AAAAAAA9\ntitle: q\n"status": backlog\n---\n\n# q\n');
    const flow = put(paths, '03-stories/STORY-AAAAAAA8-f.md', '---\n{schema: 1, type: story, id: STORY-AAAAAAA8, title: f, status: backlog}\n---\n\n# f\n');
    let scan = await scanWorkspace(paths);
    await setStatus(scan, getArtifact(scan, 'AAAAAAA9'), 'ready');
    await setStatus(scan, getArtifact(scan, 'AAAAAAA8'), 'ready');
    expect(fs.readFileSync(quoted, 'utf8')).toBe('---\nschema: 1\ntype: story\nid: STORY-AAAAAAA9\ntitle: q\n"status": ready\n---\n\n# q\n');
    expect(fs.readFileSync(flow, 'utf8')).toContain('status: ready}');
    scan = await scanWorkspace(paths);
    expect(scan.issues).toEqual([]);
    expect(scan.stories.map((s) => s.status)).toEqual(['ready', 'ready']);
  });

  it('refuses without writing when the file changed since the scan', async () => {
    const { paths } = project();
    const file = put(paths, '03-stories/STORY-AAAAAAA7-x.md', story({ id: 'STORY-AAAAAAA7', status: 'ready' }));
    const scan = await scanWorkspace(paths);
    const edited = fs.readFileSync(file, 'utf8').replace('status: ready', 'status: blocked');
    fs.writeFileSync(file, edited);
    await expect(setStatus(scan, getArtifact(scan, 'AAAAAAA7'), 'in-progress')).rejects.toThrow(/changed on disk/);
    expect(fs.readFileSync(file, 'utf8')).toBe(edited);
  });
});

describe('readiness (derived, for agents and orchestrators)', () => {
  it('a story can start when it is ready/backlog and every dependency is done', async () => {
    const { paths } = project();
    put(paths, '03-stories/STORY-AAAAAAA1-a.md', story({ id: 'STORY-AAAAAAA1', status: 'done' }));
    put(paths, '03-stories/STORY-AAAAAAA2-b.md', story({ id: 'STORY-AAAAAAA2', status: 'in-progress' }));
    put(paths, '03-stories/STORY-AAAAAAA3-c.md', story({ id: 'STORY-AAAAAAA3', status: 'ready', title: 'C', depends_on: ['STORY-AAAAAAA1'] }));
    put(paths, '03-stories/STORY-AAAAAAA4-d.md', story({ id: 'STORY-AAAAAAA4', status: 'ready', depends_on: ['STORY-AAAAAAA2'] }));
    put(paths, '03-stories/STORY-AAAAAAA5-e.md', story({ id: 'STORY-AAAAAAA5', status: 'backlog', title: 'E', priority: 'p0' }));
    put(paths, '03-stories/STORY-AAAAAAA6-f.md', story({ id: 'STORY-AAAAAAA6', status: 'backlog', depends_on: ['STORY-ZZZZZZZZ'] }));
    const scan = await scanWorkspace(paths);
    const byId = (id: string) => scan.stories.find((s) => s.id === id) as Story;
    expect(storyReadiness(scan, byId('STORY-AAAAAAA3'))).toEqual({ dependenciesDone: true, waitingOn: [], ready: true });
    expect(storyReadiness(scan, byId('STORY-AAAAAAA4'))).toEqual({ dependenciesDone: false, waitingOn: ['STORY-AAAAAAA2'], ready: false });
    expect(storyReadiness(scan, byId('STORY-AAAAAAA6'))).toEqual({ dependenciesDone: false, waitingOn: ['STORY-ZZZZZZZZ'], ready: false });
    expect(storyReadiness(scan, byId('STORY-AAAAAAA2')).ready).toBe(false);
    // `ready` status first, then backlog; each by priority.
    expect(readyToStart(scan).map((s) => s.id)).toEqual(['STORY-AAAAAAA3', 'STORY-AAAAAAA5']);
  });
});

describe('dependency cycles on very deep chains', () => {
  it('does not overflow the stack on a 20,000-deep chain and still finds a cycle at its end', () => {
    const n = 20_000;
    const id = (i: number) => `STORY-${String(i).padStart(8, '0')}`;
    const stories = Array.from({ length: n }, (_, i) => ({ id: id(i), depends_on: i ? [id(i - 1)] : [] }) as unknown as Story);
    expect(findDependencyCycles(stories)).toEqual([]);
    stories[0] = { id: id(0), depends_on: [id(n - 1)] } as unknown as Story;
    const cycles = findDependencyCycles(stories);
    expect(cycles).toHaveLength(1);
    expect(cycles[0]).toHaveLength(n);
    expect(cycles[0]![0]).toBe(id(0));
  });

  it('reports the same small cycles as before', () => {
    const s = (id: string, deps: string[]) => ({ id, depends_on: deps }) as unknown as Story;
    expect(findDependencyCycles([s('STORY-C', ['STORY-A']), s('STORY-A', ['STORY-B']), s('STORY-B', ['STORY-C']), s('STORY-D', ['STORY-D'])])).toEqual([
      ['STORY-A', 'STORY-B', 'STORY-C'],
    ]);
  });
});

describe('scanner warnings', () => {
  it('warns when " #" cut a hand-written title', async () => {
    const { paths } = project();
    put(paths, '03-stories/STORY-AAAAAAA3.md', '---\nschema: 1\ntype: story\nid: STORY-AAAAAAA3\ntitle: Fix #123 crash\nstatus: backlog\n---\n');
    const scan = await scanWorkspace(paths);
    expect(scan.stories[0]!.title).toBe('Fix');
    const warning = scan.issues.find((i) => i.message.includes('YAML reads " #" as a comment'));
    expect(warning).toMatchObject({ level: 'warn', code: 'metadata' });
    expect(warning!.detail).toEqual(['Quote the title if the # belongs to it: title: "Fix #123 crash"']);
  });

  it('reports an unreadable artifact instead of crashing the scan', async () => {
    const { paths } = project();
    put(paths, '03-stories/STORY-AAAAAAA1-ok.md', story({ id: 'STORY-AAAAAAA1' }));
    fs.mkdirSync(path.join(paths.abs, 'elsewhere'), { recursive: true });
    fs.symlinkSync(path.join(paths.abs, 'elsewhere'), path.join(paths.abs, '03-stories', 'STORY-AAAAAAA2-dir.md'));
    const scan = await scanWorkspace(paths);
    expect(scan.stories.map((s) => s.id)).toEqual(['STORY-AAAAAAA1']);
    expect(scan.issues.find((i) => i.message.includes('cannot be read'))).toMatchObject({ level: 'error', code: 'invalid' });
  });
});

describe('findIgnoredWorkPaths', () => {
  it('reports the matching .gitignore rule, and nothing when not ignored or not a repository', async () => {
    const { root, paths } = project();
    expect(await findIgnoredWorkPaths(paths)).toBeNull();
    execFileSync('git', ['init', '-q'], { cwd: root });
    expect(await findIgnoredWorkPaths(paths)).toEqual([]);
    fs.writeFileSync(path.join(root, '.gitignore'), 'node_modules\n/docs/\n');
    const ignored = await findIgnoredWorkPaths(paths);
    expect(ignored![0]).toEqual({ path: 'docs/agile/README.md', source: '.gitignore:2', pattern: '/docs/' });
    fs.writeFileSync(path.join(root, '.gitignore'), '/docs/*\n!/docs/agile/\n');
    expect(await findIgnoredWorkPaths(paths)).toEqual([]);
  });
});

describe('epic helpers stay consistent with the index', () => {
  it('stories added to a scan after a query are seen by later queries', async () => {
    const { paths } = project();
    put(paths, '02-epics/EPIC-AAAAAAA1-e.md', epic({ id: 'EPIC-AAAAAAA1' }));
    put(paths, '03-stories/STORY-AAAAAAA1-a.md', story({ id: 'STORY-AAAAAAA1', epic: 'EPIC-AAAAAAA1' }));
    const scan = await scanWorkspace(paths);
    expect(readyToStart(scan).length).toBe(1);
    scan.stories.push({ ...scan.stories[0]!, id: 'STORY-AAAAAAA2', path: 'x' });
    expect(readyToStart(scan).map((s) => s.id).sort()).toEqual(['STORY-AAAAAAA1', 'STORY-AAAAAAA2']);
  });
});
