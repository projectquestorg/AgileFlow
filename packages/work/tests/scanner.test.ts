import { describe, expect, it } from 'vitest';
import { resolveWorkPaths, scanWorkspace, WorkError } from '@agileflow/work';
import { epic, project, put, story } from './helpers';

describe('scanner', () => {
  it('returns typed artifacts from 02-epics, 03-stories, and 04-decisions', async () => {
    const { paths } = project('healthy');
    const scan = await scanWorkspace(paths);
    expect(scan.exists).toBe(true);
    expect(scan.issues).toEqual([]);
    expect(scan.epics.map((e) => e.id).sort()).toEqual(['EPIC-7M4K2P9Q', 'EPIC-D8P2A6MW']);
    expect(scan.stories).toHaveLength(5);
    expect(scan.decisions.map((d) => d.id)).toEqual(['DEC-4C8M2Q7K']);
    const google = scan.stories.find((s) => s.id === 'STORY-3Q7MX2PK')!;
    expect(google).toMatchObject({
      type: 'story',
      title: 'Add Google sign-in',
      status: 'ready',
      priority: 'p1',
      epic: 'EPIC-7M4K2P9Q',
      depends_on: ['STORY-T9K2P4VC'],
      path: 'docs/agile/03-stories/STORY-3Q7MX2PK-google-login.md',
    });
    expect(google.body.startsWith('\n# Add Google sign-in\n')).toBe(true);
  });

  it('a missing workspace is reported, not created', async () => {
    const { paths } = project();
    const scan = await scanWorkspace(paths);
    expect(scan).toMatchObject({ exists: false, epics: [], stories: [], decisions: [] });
  });

  it('never searches outside the known folders', async () => {
    const { paths } = project('healthy');
    put(paths, '00-product/STORY-AAAAAAAA-hidden.md', story({ id: 'STORY-AAAAAAAA' }));
    put(paths, '../../notes/STORY-BBBBBBBB.md', story({ id: 'STORY-BBBBBBBB' }));
    const scan = await scanWorkspace(paths);
    expect(scan.stories.map((s) => s.id)).not.toContain('STORY-AAAAAAAA');
    expect(scan.stories.map((s) => s.id)).not.toContain('STORY-BBBBBBBB');
  });

  it('reports files that do not belong instead of loading them', async () => {
    const { paths } = project('healthy');
    put(paths, 'status.json', '{}');
    put(paths, 'scratchpad.md', '# notes');
    put(paths, '05-misc/x.md', '# misc');
    put(paths, '03-stories/done/STORY-CCCCCCCC-x.md', story({ id: 'STORY-CCCCCCCC' }));
    put(paths, '03-stories/board.txt', 'x');
    const scan = await scanWorkspace(paths);
    const messages = scan.issues.map((i) => i.message);
    expect(messages).toContain('status.json is not part of the Work workspace');
    expect(messages).toContain('scratchpad.md is not part of the Work workspace');
    expect(messages).toContain('05-misc/ is not part of the Work workspace');
    expect(messages.some((m) => /03-stories\/done\/ is a subfolder/.test(m))).toBe(true);
    expect(messages.some((m) => /board\.txt is not a Markdown story/.test(m))).toBe(true);
    expect(scan.issues.every((i) => i.level === 'warn')).toBe(true);
    expect(scan.stories.map((s) => s.id)).not.toContain('STORY-CCCCCCCC');
  });

  it('reports invalid artifacts as errors and skips them', async () => {
    const { paths } = project();
    put(paths, '03-stories/STORY-DDDDDDDD-a.md', '# no frontmatter\n');
    put(paths, '03-stories/STORY-EEEEEEEE-b.md', story({ id: 'STORY-EEEEEEEE', status: 'grooming' }));
    put(paths, '02-epics/EPIC-FFFFFFFF-c.md', story({ id: 'STORY-FFFFFFFF' }));
    put(paths, '03-stories/STORY-GGGGGGGG-d.md', story({ id: 'STORY-GGGGGGGG', estimate: 3 }));
    const scan = await scanWorkspace(paths);
    const byLevel = (level: string) => scan.issues.filter((i) => i.level === level).map((i) => i.message);
    expect(byLevel('error')).toEqual([
      'docs/agile/02-epics/EPIC-FFFFFFFF-c.md: type is "story" but the file is in the epic folder',
      'docs/agile/03-stories/STORY-DDDDDDDD-a.md: missing YAML frontmatter',
      expect.stringMatching(/STORY-EEEEEEEE-b\.md: status:/),
    ]);
    expect(byLevel('warn')).toEqual(['docs/agile/03-stories/STORY-GGGGGGGG-d.md: unknown field estimate (not part of story schema 1)']);
    expect(scan.stories.map((s) => s.id)).toEqual(['STORY-GGGGGGGG']);
  });

  it('warns when a file name does not start with its id (the id is authoritative)', async () => {
    const { paths } = project();
    put(paths, '02-epics/EPIC-HHHHHHHH-renamed-later.md', epic({ id: 'EPIC-HHHHHHHH', title: 'A new title' }));
    put(paths, '02-epics/social-auth.md', epic({ id: 'EPIC-JJJJJJJJ' }));
    const scan = await scanWorkspace(paths);
    expect(scan.epics).toHaveLength(2);
    expect(scan.issues.map((i) => i.message)).toEqual(['docs/agile/02-epics/social-auth.md: file name does not start with its id EPIC-JJJJJJJJ']);
  });

  it('keeps the root inside the project', () => {
    expect(resolveWorkPaths('/p', 'planning').root).toBe('planning');
    expect(resolveWorkPaths('/p', './docs/agile/').root).toBe('docs/agile');
    for (const bad of ['/abs', '../outside', '.', '', 'C:/x']) expect(() => resolveWorkPaths('/p', bad)).toThrow(WorkError);
  });
});
