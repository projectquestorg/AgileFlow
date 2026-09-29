import { describe, expect, it } from 'vitest';
import { nextStories, scanWorkspace } from '@agileflow/work';
import { epic, project, put, story } from './helpers';

describe('nextStories', () => {
  it('returns ready stories whose dependencies are done, best first, with reasons; explains the rest', async () => {
    const { paths } = project();
    put(paths, '02-epics/EPIC-AAAAAAA1.md', epic({ id: 'EPIC-AAAAAAA1', status: 'active', horizon: 'now' }));
    put(paths, '02-epics/EPIC-AAAAAAA2.md', epic({ id: 'EPIC-AAAAAAA2', status: 'cancelled' }));
    put(paths, '03-stories/STORY-AAAAAAA1.md', story({ id: 'STORY-AAAAAAA1', title: 'Done dep', status: 'done' }));
    put(paths, '03-stories/STORY-AAAAAAA2.md', story({ id: 'STORY-AAAAAAA2', title: 'Wip dep', status: 'in-progress' }));
    put(paths, '03-stories/STORY-AAAAAAA3.md', story({ id: 'STORY-AAAAAAA3', title: 'Go p2', status: 'ready', priority: 'p2', depends_on: ['STORY-AAAAAAA1'] }));
    put(paths, '03-stories/STORY-AAAAAAA4.md', story({ id: 'STORY-AAAAAAA4', title: 'Go p1 in now epic', status: 'ready', priority: 'p1', epic: 'EPIC-AAAAAAA1' }));
    put(paths, '03-stories/STORY-AAAAAAA5.md', story({ id: 'STORY-AAAAAAA5', title: 'Go p1 unblocks', status: 'ready', priority: 'p1' }));
    put(paths, '03-stories/STORY-AAAAAAA6.md', story({ id: 'STORY-AAAAAAA6', title: 'Waits', status: 'ready', priority: 'p0', depends_on: ['STORY-AAAAAAA2', 'STORY-ZZZZZZZZ'] }));
    put(paths, '03-stories/STORY-AAAAAAA7.md', story({ id: 'STORY-AAAAAAA7', title: 'Backlog', status: 'backlog', depends_on: ['STORY-AAAAAAA5'] }));
    put(paths, '03-stories/STORY-AAAAAAA8.md', story({ id: 'STORY-AAAAAAA8', title: 'Cancelled epic', status: 'ready', epic: 'EPIC-AAAAAAA2' }));
    put(paths, '03-stories/STORY-AAAAAAA9-a.md', story({ id: 'STORY-AAAAAAA9', title: 'Dup a', status: 'ready' }));
    put(paths, '03-stories/STORY-AAAAAAA9-b.md', story({ id: 'STORY-AAAAAAA9', title: 'Dup b', status: 'ready' }));
    const scan = await scanWorkspace(paths);

    const result = nextStories(scan, { explain: true, limit: 10 });
    // p1 before p2; among p1 the epic with horizon `now` first, then by what it unblocks.
    expect(result.eligible.map((c) => c.story.id)).toEqual(['STORY-AAAAAAA4', 'STORY-AAAAAAA5', 'STORY-AAAAAAA3']);
    expect(result.totalEligible).toBe(3);
    expect(result.eligible[0]!.reasons).toEqual(['status is ready, priority p1', 'no dependencies', 'epic EPIC-AAAAAAA1 is active, horizon now']);
    expect(result.eligible[1]!.reasons).toEqual(['status is ready, priority p1', 'no dependencies', 'unblocks 1 open story (STORY-AAAAAAA7)']);
    expect(result.eligible[2]!.reasons).toEqual(['status is ready, priority p2', 'every dependency is done (STORY-AAAAAAA1)']);

    const why = Object.fromEntries(result.notEligible.map((c) => [c.story.id, c.reasons]));
    expect(why['STORY-AAAAAAA6']).toEqual(['waiting on STORY-AAAAAAA2 is in-progress, STORY-ZZZZZZZZ does not exist']);
    expect(why['STORY-AAAAAAA7']).toEqual(['status is backlog: refine it and set it to ready first', 'waiting on STORY-AAAAAAA5 is ready']);
    expect(why['STORY-AAAAAAA8']).toEqual(['epic EPIC-AAAAAAA2 is cancelled']);
    expect(why['STORY-AAAAAAA9']).toEqual(['STORY-AAAAAAA9 is used by more than one file (duplicate ID)']);
    // Ready stories are explained before backlog ones.
    expect(result.notEligible.at(-1)!.story.id).toBe('STORY-AAAAAAA7');

    expect(nextStories(scan, { limit: 1 }).eligible).toHaveLength(1);
    expect(nextStories(scan).notEligible).toEqual([]);
    expect(nextStories(scan, { epic: 'EPIC-AAAAAAA1' }).eligible.map((c) => c.story.id)).toEqual(['STORY-AAAAAAA4']);
  });
});
