import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  capList,
  contentHash,
  describeIgnoredWorkPaths,
  duplicateIds,
  getArtifact,
  oneLine,
  scanWorkspace,
  setStatus,
  stripTerminalEscapes,
  validateWorkspace,
} from '@agileflow/work';
import { epic, project, put, story } from './helpers';

describe('change detection before writing', () => {
  it('records a content hash and mtime per artifact file at scan time', async () => {
    const { paths } = project();
    const abs = put(paths, '03-stories/STORY-AAAAAAA1.md', story({ id: 'STORY-AAAAAAA1' }));
    const scan = await scanWorkspace(paths);
    const rev = scan.revisions.get('docs/agile/03-stories/STORY-AAAAAAA1.md')!;
    expect(rev.hash).toBe(contentHash(fs.readFileSync(abs)));
    expect(rev.hash).toMatch(/^sha256:[0-9a-f]{16}$/);
    expect(rev.mtimeMs).toBe(fs.statSync(abs).mtimeMs);
    expect(rev.size).toBe(fs.statSync(abs).size);
  });

  it('refuses when the file changed after the scan, even when id and status are unchanged; nothing is written', async () => {
    const { paths } = project();
    const abs = put(paths, '03-stories/STORY-AAAAAAA1.md', story({ id: 'STORY-AAAAAAA1', status: 'ready' }, '# One\n'));
    const scan = await scanWorkspace(paths);
    const edited = story({ id: 'STORY-AAAAAAA1', status: 'ready' }, '# One\n\nAn edit made by another agent.\n');
    fs.writeFileSync(abs, edited);
    await expect(setStatus(scan, getArtifact(scan, 'STORY-AAAAAAA1'), 'in-progress')).rejects.toThrow(
      'docs/agile/03-stories/STORY-AAAAAAA1.md changed on disk since this command read it',
    );
    expect(fs.readFileSync(abs, 'utf8')).toBe(edited);
    fs.rmSync(abs);
    await expect(setStatus(scan, getArtifact(scan, 'STORY-AAAAAAA1'), 'in-progress')).rejects.toThrow('changed on disk');
    expect(fs.existsSync(abs)).toBe(false);
  });

  it('writes atomically (no temporary files left) when nothing changed', async () => {
    const { paths } = project();
    const abs = put(paths, '03-stories/STORY-AAAAAAA1.md', story({ id: 'STORY-AAAAAAA1', status: 'ready' }));
    const scan = await scanWorkspace(paths);
    await setStatus(scan, getArtifact(scan, 'STORY-AAAAAAA1'), 'in-progress');
    expect(fs.readFileSync(abs, 'utf8')).toContain('status: in-progress');
    expect(fs.readdirSync(path.dirname(abs))).toEqual(['STORY-AAAAAAA1.md']);
  });

  it('closing an epic re-reads its stories: a story reopened or added after the scan blocks it', async () => {
    const { paths } = project();
    const epicFile = put(paths, '02-epics/EPIC-AAAAAAA1.md', epic({ id: 'EPIC-AAAAAAA1', status: 'active' }));
    const s1 = put(paths, '03-stories/STORY-AAAAAAA1.md', story({ id: 'STORY-AAAAAAA1', status: 'done', epic: 'EPIC-AAAAAAA1' }));
    const epicBefore = fs.readFileSync(epicFile, 'utf8');

    let scan = await scanWorkspace(paths);
    fs.writeFileSync(s1, story({ id: 'STORY-AAAAAAA1', status: 'in-progress', epic: 'EPIC-AAAAAAA1' }));
    await expect(setStatus(scan, getArtifact(scan, 'EPIC-AAAAAAA1'), 'done')).rejects.toThrow('STORY-AAAAAAA1.md changed on disk');
    expect(fs.readFileSync(epicFile, 'utf8')).toBe(epicBefore);

    fs.writeFileSync(s1, story({ id: 'STORY-AAAAAAA1', status: 'done', epic: 'EPIC-AAAAAAA1' }));
    scan = await scanWorkspace(paths);
    put(paths, '03-stories/STORY-AAAAAAA2.md', story({ id: 'STORY-AAAAAAA2', status: 'backlog', epic: 'EPIC-AAAAAAA1' }));
    await expect(setStatus(scan, getArtifact(scan, 'EPIC-AAAAAAA1'), 'done')).rejects.toThrow('STORY-AAAAAAA2.md changed on disk');
    expect(fs.readFileSync(epicFile, 'utf8')).toBe(epicBefore);

    // A new story for another epic does not matter.
    fs.rmSync(path.join(paths.abs, '03-stories/STORY-AAAAAAA2.md'));
    scan = await scanWorkspace(paths);
    put(paths, '03-stories/STORY-AAAAAAA3.md', story({ id: 'STORY-AAAAAAA3', status: 'backlog' }));
    expect((await setStatus(scan, getArtifact(scan, 'EPIC-AAAAAAA1'), 'done')).changed).toBe(true);
  });
});

describe('duplicate IDs', () => {
  it('are listed with every file', async () => {
    const { paths } = project();
    put(paths, '03-stories/STORY-AAAAAAA1-a.md', story({ id: 'STORY-AAAAAAA1' }));
    put(paths, '03-stories/STORY-AAAAAAA1-b.md', story({ id: 'STORY-AAAAAAA1' }));
    put(paths, '03-stories/STORY-AAAAAAA2.md', story({ id: 'STORY-AAAAAAA2' }));
    expect(duplicateIds(await scanWorkspace(paths))).toEqual([
      { id: 'STORY-AAAAAAA1', paths: ['docs/agile/03-stories/STORY-AAAAAAA1-a.md', 'docs/agile/03-stories/STORY-AAAAAAA1-b.md'] },
    ]);
  });
});

describe('text safety', () => {
  it('strips whole escape sequences (no [31m remnants) and control characters', () => {
    expect(stripTerminalEscapes('a\u001b[31mred\u001b[0m b\u001b]0;title\u0007c\u0007\td\n')).toBe('ared bc\td\n');
    expect(oneLine('  x\u001b[1m y \r\n z\u2028w ')).toBe('x y z w');
  });

  it('caps long lists', () => {
    expect(capList(['a', 'b', 'c'], 3)).toBe('a -> b -> c');
    expect(capList(['a', 'b', 'c', 'd', 'e'], 2)).toBe('a -> b -> ... (3 more)');
  });

  it('long dependency cycles are shortened in check output', async () => {
    const { paths } = project();
    const n = 50;
    const id = (i: number) => `STORY-${String(i).padStart(8, '0')}`;
    for (let i = 0; i < n; i++) put(paths, `03-stories/${id(i)}.md`, story({ id: id(i), depends_on: [id((i + 1) % n)] }));
    const cycle = validateWorkspace(await scanWorkspace(paths)).issues.find((i) => i.message === 'dependency cycle')!;
    expect(cycle.detail).toHaveLength(1);
    expect(cycle.detail![0]).toMatch(/^STORY-00000000 -> STORY-00000001 -> .* -> STORY-00000011 -> \.\.\. \(39 more\)$/);
    expect(cycle.detail![0]!.length).toBeLessThan(300);
  });
});

describe('gitignore warnings', () => {
  it('name the ignored subfolder when only part of the workspace is ignored', () => {
    const paths = { projectRoot: '/p', root: 'docs/agile', abs: '/p/docs/agile' };
    const probe = (p: string) => ({ path: `docs/agile/${p}`, source: '.gitignore:3', pattern: '03-stories/' });
    expect(describeIgnoredWorkPaths(paths, [probe('03-stories/STORY-00000000.md')])).toEqual([
      'docs/agile/03-stories/ is ignored by Git (.gitignore:3: 03-stories/), so files there would not be committed or shared. Change .gitignore so it no longer matches.',
    ]);
    const all = ['README.md', '00-product/product.md', '01-roadmap/roadmap.md', '02-epics/E.md', '03-stories/S.md', '04-decisions/D.md'].map((p) => ({
      path: `docs/agile/${p}`,
      source: '.gitignore:1',
      pattern: '/docs/',
    }));
    expect(describeIgnoredWorkPaths(paths, all)[0]).toMatch(/^docs\/agile\/ is ignored by Git \(\.gitignore:1: \/docs\/\)/);
    expect(describeIgnoredWorkPaths(paths, [])).toEqual([]);
  });
});
