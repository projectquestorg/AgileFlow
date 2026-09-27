import { describe, expect, it } from 'vitest';
import {
  acceptanceCriteria,
  blockedStories,
  buildBoard,
  decisionsFor,
  dependenciesForStory,
  dependentsOfStory,
  epicProgress,
  getArtifact,
  getEpic,
  getStory,
  listEpics,
  listStories,
  readyStories,
  scanWorkspace,
  storiesForEpic,
} from '@agileflow/work';
import { epic, project, put, story } from './helpers';

describe('queries', async () => {
  it('lists and filters stories and epics', async () => {
    const scan = await scanWorkspace(project('healthy').paths);
    expect(listStories(scan).map((s) => s.id)).toEqual([
      'STORY-3Q7MX2PK', // p1, titles alphabetical within priority
      'STORY-T9K2P4VC',
      'STORY-Q6M2J7NK',
      'STORY-F8Q4N6JC',
      'STORY-H5D2V8NA', // p2
    ]);
    expect(listStories(scan, { status: 'ready' }).map((s) => s.id)).toEqual(['STORY-3Q7MX2PK', 'STORY-Q6M2J7NK']);
    expect(listStories(scan, { status: ['blocked', 'backlog'] }).map((s) => s.status)).toEqual(['blocked', 'backlog']);
    expect(listStories(scan, { epic: 'EPIC-D8P2A6MW' })).toEqual([]);
    expect(listEpics(scan).map((e) => e.id)).toEqual(['EPIC-7M4K2P9Q', 'EPIC-D8P2A6MW']);
    expect(listEpics(scan, { horizon: 'next' }).map((e) => e.id)).toEqual(['EPIC-D8P2A6MW']);
    expect(readyStories(scan).map((s) => s.id)).toEqual(['STORY-3Q7MX2PK', 'STORY-Q6M2J7NK']);
    expect(blockedStories(scan).map((s) => s.id)).toEqual(['STORY-F8Q4N6JC']);
  });

  it('gets items by partial id and derives relationships from story.epic and depends_on', async () => {
    const scan = await scanWorkspace(project('healthy').paths);
    expect(getStory(scan, '3q7m').title).toBe('Add Google sign-in');
    expect(getEpic(scan, 'EPIC-7M4').title).toBe('Social authentication');
    expect(getArtifact(scan, '4C8M').type).toBe('decision');
    expect(() => getStory(scan, '7M4K')).toThrow(/No story/);
    expect(storiesForEpic(scan, 'EPIC-7M4K2P9Q').map((s) => s.id).sort()).toEqual([
      'STORY-3Q7MX2PK',
      'STORY-F8Q4N6JC',
      'STORY-H5D2V8NA',
      'STORY-T9K2P4VC',
    ]);
    const google = getStory(scan, '3Q7M');
    expect(dependenciesForStory(scan, google).map((d) => [d.id, d.story?.status])).toEqual([['STORY-T9K2P4VC', 'done']]);
    expect(dependentsOfStory(scan, google.id).map((s) => s.id)).toEqual(['STORY-F8Q4N6JC']);
    expect(decisionsFor(scan, 'EPIC-7M4K2P9Q').map((d) => d.id)).toEqual(['DEC-4C8M2Q7K']);
    expect(epicProgress(scan, 'EPIC-7M4K2P9Q')).toEqual({ total: 4, done: 1, cancelled: 0, open: 3 });
  });

  it('standalone stories work without an epic', async () => {
    const scan = await scanWorkspace(project('healthy').paths);
    const invoice = getStory(scan, 'Q6M2');
    expect(invoice.epic).toBeUndefined();
    expect(buildBoard(scan).standalone.flatMap((c) => c.stories.map((s) => s.id))).toEqual(['STORY-Q6M2J7NK']);
  });
});

describe('acceptance criteria', () => {
  it('counts checkboxes in the Acceptance Criteria section only', () => {
    const body = `# S

## Why

- [ ] not a criterion (outside the section)

## Acceptance Criteria

- [x] One
- [ ] Two
* [X] Three
1. [ ] Four

### Notes inside the section

- [ ] Five (a sub-heading stays inside the section)

\`\`\`markdown
- [ ] fenced, ignored
\`\`\`

## Constraints

- [ ] also not a criterion
`;
    expect(acceptanceCriteria(body)).toEqual({ total: 5, checked: 2, unchecked: ['Two', 'Four', 'Five (a sub-heading stays inside the section)'] });
  });

  it('falls back to every checkbox when there is no section', () => {
    expect(acceptanceCriteria('- [ ] a\n- [x] b\n')).toEqual({ total: 2, checked: 1, unchecked: ['a'] });
    expect(acceptanceCriteria('# Nothing\n')).toEqual({ total: 0, checked: 0, unchecked: [] });
  });
});

describe('board', () => {
  it('groups open epics by horizon, stories by status, and standalone stories', async () => {
    const scan = await scanWorkspace(project('healthy').paths);
    const board = buildBoard(scan);
    expect(board.groups.map((g) => g.horizon)).toEqual(['now', 'next']);
    const social = board.groups[0]!.epics[0]!;
    expect(social.epic.id).toBe('EPIC-7M4K2P9Q');
    // Done work is summarized in progress, not listed.
    expect(social.columns.map((c) => [c.status, c.stories.map((s) => s.id)])).toEqual([
      ['backlog', ['STORY-H5D2V8NA']],
      ['ready', ['STORY-3Q7MX2PK']],
      ['blocked', ['STORY-F8Q4N6JC']],
    ]);
    expect(social.progress.done).toBe(1);
    expect(board.groups[1]!.epics[0]!.columns).toEqual([]);
    expect(board.standalone.map((c) => c.status)).toEqual(['ready']);
    expect(board.warnings).toEqual([]);
  });

  it('flags ready stories whose dependencies are not done, without changing anything', async () => {
    const { paths } = project();
    put(paths, '02-epics/EPIC-AAAAAAAA-x.md', epic({ id: 'EPIC-AAAAAAAA', horizon: 'later' }));
    put(paths, '03-stories/STORY-AAAAAAAA-a.md', story({ id: 'STORY-AAAAAAAA', status: 'ready', epic: 'EPIC-AAAAAAAA', depends_on: ['STORY-BBBBBBBB'] }));
    put(paths, '03-stories/STORY-BBBBBBBB-b.md', story({ id: 'STORY-BBBBBBBB', status: 'in-progress', epic: 'EPIC-AAAAAAAA' }));
    put(paths, '03-stories/STORY-CCCCCCCC-c.md', story({ id: 'STORY-CCCCCCCC', status: 'in-review' }));
    put(paths, '03-stories/STORY-DDDDDDDD-d.md', story({ id: 'STORY-DDDDDDDD', status: 'done' }));
    const scan = await scanWorkspace(paths);
    const board = buildBoard(scan);
    expect(board.groups.map((g) => g.horizon)).toEqual(['later']);
    expect(board.groups[0]!.epics[0]!.columns.map((c) => c.status)).toEqual(['ready', 'in-progress']);
    expect(board.standalone.map((c) => [c.status, c.stories.map((s) => s.id)])).toEqual([['in-review', ['STORY-CCCCCCCC']]]);
    expect(board.warnings.map((w) => [w.story.id, w.dependency.id, w.dependency.story?.status])).toEqual([
      ['STORY-AAAAAAAA', 'STORY-BBBBBBBB', 'in-progress'],
    ]);
    expect((await scanWorkspace(paths)).stories.find((s) => s.id === 'STORY-AAAAAAAA')!.status).toBe('ready');
  });

  it('stories of a closed or unknown epic show up as standalone rather than disappearing', async () => {
    const { paths } = project();
    put(paths, '02-epics/EPIC-AAAAAAAA-x.md', epic({ id: 'EPIC-AAAAAAAA', status: 'cancelled' }));
    put(paths, '03-stories/STORY-AAAAAAAA-a.md', story({ id: 'STORY-AAAAAAAA', status: 'ready', epic: 'EPIC-AAAAAAAA' }));
    put(paths, '03-stories/STORY-BBBBBBBB-b.md', story({ id: 'STORY-BBBBBBBB', status: 'ready', epic: 'EPIC-ZZZZZZZZ' }));
    const board = buildBoard(await scanWorkspace(paths));
    expect(board.groups).toEqual([]);
    expect(board.standalone[0]!.stories.map((s) => s.id)).toEqual(['STORY-AAAAAAAA', 'STORY-BBBBBBBB']);
  });
});
