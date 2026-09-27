import { describe, expect, it } from 'vitest';
import { findDependencyCycles, scanWorkspace, validateWorkspace, type Story } from '@agileflow/work';
import { decision, epic, project, put, story } from './helpers';

const validate = async (paths: Parameters<typeof scanWorkspace>[0]) => validateWorkspace(await scanWorkspace(paths));
const messages = (v: Awaited<ReturnType<typeof validate>>, level?: 'error' | 'warn') =>
  v.issues.filter((i) => !level || i.level === level).map((i) => i.message);

describe('validateWorkspace', () => {
  it('a healthy workspace passes every check', async () => {
    const v = await validate(project('healthy').paths);
    expect(v.issues).toEqual([]);
    expect(v.counts).toEqual({ epics: 2, stories: 5, decisions: 1 });
    expect(v.passed).toEqual(['workspace structure valid', 'no duplicate IDs', 'no missing epic references', 'dependency graph valid']);
  });

  it('detects duplicate IDs', async () => {
    const { paths } = project('healthy');
    put(paths, '03-stories/STORY-3Q7MX2PK-google-auth.md', story({ id: 'STORY-3Q7MX2PK' }));
    const v = await validate(paths);
    expect(v.issues.find((i) => i.message.startsWith('duplicate story id STORY-3Q7MX2PK'))).toEqual({
      level: 'error',
      message: 'duplicate story id STORY-3Q7MX2PK (2 files)',
      detail: [
        'docs/agile/03-stories/STORY-3Q7MX2PK-google-auth.md',
        'docs/agile/03-stories/STORY-3Q7MX2PK-google-login.md',
        'Commands refuse to act on this ID until every copy but one has a new ID.',
      ],
    });
    expect(v.passed).not.toContain('no duplicate IDs');
  });

  it('detects an unknown epic reference', async () => {
    const { paths } = project();
    put(paths, '03-stories/STORY-3Q7MX2PK-a.md', story({ id: 'STORY-3Q7MX2PK', epic: 'EPIC-AAAA1111' }));
    const v = await validate(paths);
    expect(messages(v, 'error')).toContain('STORY-3Q7MX2PK references unknown epic EPIC-AAAA1111');
    expect(v.passed).not.toContain('no missing epic references');
  });

  it('detects unknown and self dependencies', async () => {
    const { paths } = project();
    put(paths, '03-stories/STORY-AAAAAAAA-a.md', story({ id: 'STORY-AAAAAAAA', depends_on: ['STORY-ZZZZZZZZ', 'STORY-AAAAAAAA'] }));
    const v = await validate(paths);
    expect(messages(v, 'error')).toEqual(['STORY-AAAAAAAA depends on unknown story STORY-ZZZZZZZZ', 'STORY-AAAAAAAA depends on itself']);
    expect(v.passed).not.toContain('dependency graph valid');
  });

  it('detects dependency cycles and reports each once', async () => {
    const { paths } = project();
    put(paths, '03-stories/STORY-AAAAAAAA-a.md', story({ id: 'STORY-AAAAAAAA', depends_on: ['STORY-BBBBBBBB'] }));
    put(paths, '03-stories/STORY-BBBBBBBB-b.md', story({ id: 'STORY-BBBBBBBB', depends_on: ['STORY-CCCCCCCC'] }));
    put(paths, '03-stories/STORY-CCCCCCCC-c.md', story({ id: 'STORY-CCCCCCCC', depends_on: ['STORY-AAAAAAAA'] }));
    put(paths, '03-stories/STORY-DDDDDDDD-d.md', story({ id: 'STORY-DDDDDDDD', depends_on: ['STORY-AAAAAAAA'] }));
    const v = await validate(paths);
    expect(v.issues.filter((i) => i.message === 'dependency cycle')).toEqual([
      { level: 'error', message: 'dependency cycle', detail: ['STORY-AAAAAAAA -> STORY-BBBBBBBB -> STORY-CCCCCCCC -> STORY-AAAAAAAA'] },
    ]);
    const s = (id: string, deps: string[]) => ({ id, depends_on: deps }) as Story;
    expect(findDependencyCycles([s('A', ['B']), s('B', ['A']), s('C', ['D']), s('D', ['C'])])).toEqual([
      ['A', 'B'],
      ['C', 'D'],
    ]);
    expect(findDependencyCycles([s('A', ['B']), s('B', []), s('C', ['A', 'B'])])).toEqual([]);
  });

  it('a done epic with unfinished stories cannot silently appear healthy', async () => {
    const { paths } = project('healthy');
    put(paths, '02-epics/EPIC-7M4K2P9Q-social-authentication.md', epic({ id: 'EPIC-7M4K2P9Q', status: 'done', title: 'Social authentication' }));
    const v = await validate(paths);
    const issue = v.issues.find((i) => i.message.startsWith('EPIC-7M4K2P9Q is marked done'))!;
    expect(issue.level).toBe('error');
    expect(issue.message).toBe('EPIC-7M4K2P9Q is marked done but has unfinished stories:');
    expect(issue.detail).toEqual(['STORY-3Q7MX2PK  ready', 'STORY-F8Q4N6JC  blocked', 'STORY-H5D2V8NA  backlog']);
  });

  it('warns (never changes status) when a done story has unchecked acceptance criteria', async () => {
    const { paths } = project();
    const body = '# S\n\n## Acceptance Criteria\n\n- [x] Google appears.\n- [ ] Existing email collision path is handled.\n';
    put(paths, '03-stories/STORY-3Q7MX2PK-a.md', story({ id: 'STORY-3Q7MX2PK', status: 'done' }, body));
    const v = await validate(paths);
    expect(v.issues).toContainEqual({
      level: 'warn',
      message: 'STORY-3Q7MX2PK is done but has 1 unchecked acceptance criterion',
      detail: ['[ ] Existing email collision path is handled.'],
      path: 'docs/agile/03-stories/STORY-3Q7MX2PK-a.md',
    });
    expect(v.errors).toBe(0);
    expect((await scanWorkspace(paths)).stories[0]!.status).toBe('done');
  });

  it('warns when a ready story depends on unfinished work', async () => {
    const { paths } = project();
    put(paths, '03-stories/STORY-A72DAAAA-a.md', story({ id: 'STORY-A72DAAAA', status: 'ready', depends_on: ['STORY-M88QAAAA'] }));
    put(paths, '03-stories/STORY-M88QAAAA-b.md', story({ id: 'STORY-M88QAAAA', status: 'in-progress' }));
    const v = await validate(paths);
    expect(messages(v, 'warn')).toContain('STORY-A72DAAAA is marked ready but depends on STORY-M88QAAAA (in-progress)');
    expect(v.errors).toBe(0);
  });

  it('checks decision references and IDs mentioned in bodies', async () => {
    const { paths } = project();
    put(paths, '04-decisions/DEC-AAAAAAAA-a.md', decision({ id: 'DEC-AAAAAAAA', related: ['EPIC-ZZZZZZZZ'] }));
    put(paths, '03-stories/STORY-AAAAAAAA-a.md', story({ id: 'STORY-AAAAAAAA' }, '# S\n\nFollow DEC-4C8M2Q7K and DEC-AAAAAAAA.\n'));
    const v = await validate(paths);
    expect(messages(v, 'error')).toContain('DEC-AAAAAAAA references unknown EPIC-ZZZZZZZZ');
    expect(messages(v, 'warn')).toContain('STORY-AAAAAAAA mentions unknown DEC-4C8M2Q7K');
  });

  it('reports invalid frontmatter, unknown statuses, and a missing workspace', async () => {
    const { paths } = project();
    put(paths, '03-stories/STORY-AAAAAAAA-a.md', story({ id: 'STORY-AAAAAAAA', status: 'grooming' }));
    let v = await validate(paths);
    expect(messages(v, 'error')[0]).toMatch(/STORY-AAAAAAAA-a\.md: status:/);
    expect(messages(v, 'warn')).toEqual([
      'docs/agile/README.md is missing',
      'docs/agile/00-product/product.md is missing',
      'docs/agile/01-roadmap/roadmap.md is missing',
    ]);
    v = await validate(project().paths);
    expect(messages(v)).toEqual(['Work is enabled but docs/agile/ does not exist']);
  });

  it('standalone stories are valid without an epic', async () => {
    const { paths } = project('healthy');
    put(paths, '03-stories/STORY-KKKKKKKK-typo.md', story({ id: 'STORY-KKKKKKKK', status: 'ready', title: 'Fix a typo' }));
    expect((await validate(paths)).issues).toEqual([]);
  });
});
