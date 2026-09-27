import { describe, expect, it } from 'vitest';
import {
  canTransitionDecision,
  canTransitionEpic,
  canTransitionStory,
  getArtifact,
  isValidStatus,
  reviewTransition,
  scanWorkspace,
  STORY_STATUSES,
} from '@agileflow/work';
import { epic, project, put, story } from './helpers';

describe('story state machine', () => {
  it('allows the documented flow and additional transitions', () => {
    const allowed: Array<[string, string]> = [
      ['backlog', 'ready'],
      ['ready', 'in-progress'],
      ['in-progress', 'in-review'],
      ['in-review', 'done'],
      ['in-progress', 'blocked'],
      ['ready', 'blocked'],
      ['in-review', 'blocked'],
      ['blocked', 'ready'],
      ['blocked', 'in-progress'],
      ['in-review', 'in-progress'],
      ['done', 'in-progress'], // reopening
      ['in-progress', 'done'], // repositories without a review step
    ];
    for (const [from, to] of allowed) expect(canTransitionStory(from as never, to as never), `${from} -> ${to}`).toBe(true);
    for (const active of ['backlog', 'ready', 'in-progress', 'in-review', 'blocked'] as const) {
      expect(canTransitionStory(active, 'cancelled'), `${active} -> cancelled`).toBe(true);
    }
  });

  it('marks off-path moves (still allowed, with a warning)', () => {
    expect(canTransitionStory('backlog', 'in-progress')).toBe(false);
    expect(canTransitionStory('backlog', 'done')).toBe(false);
    expect(canTransitionStory('cancelled', 'ready')).toBe(false);
    expect(canTransitionStory('done', 'cancelled')).toBe(false);
  });

  it('knows valid statuses per type', () => {
    for (const s of STORY_STATUSES) expect(isValidStatus('story', s)).toBe(true);
    expect(isValidStatus('story', 'grooming')).toBe(false);
    expect(isValidStatus('epic', 'active')).toBe(true);
    expect(isValidStatus('epic', 'in-progress')).toBe(false);
    expect(isValidStatus('decision', 'superseded')).toBe(true);
    expect(canTransitionEpic('proposed', 'active')).toBe(true);
    expect(canTransitionEpic('proposed', 'done')).toBe(false);
    expect(canTransitionDecision('accepted', 'superseded')).toBe(true);
    expect(canTransitionDecision('rejected', 'accepted')).toBe(false);
  });
});

describe('reviewTransition', () => {
  async function workspace() {
    const { paths } = project();
    put(paths, '02-epics/EPIC-AAAAAAAA-e.md', epic({ id: 'EPIC-AAAAAAAA', status: 'active' }));
    put(paths, '02-epics/EPIC-BBBBBBBB-f.md', epic({ id: 'EPIC-BBBBBBBB', status: 'active' }));
    put(paths, '03-stories/STORY-AAAAAAAA-a.md', story({ id: 'STORY-AAAAAAAA', status: 'backlog', epic: 'EPIC-AAAAAAAA', depends_on: ['STORY-BBBBBBBB'] }, '## Acceptance Criteria\n\n- [x] one\n- [ ] two\n'));
    put(paths, '03-stories/STORY-BBBBBBBB-b.md', story({ id: 'STORY-BBBBBBBB', status: 'in-progress', epic: 'EPIC-BBBBBBBB' }));
    put(paths, '03-stories/STORY-CCCCCCCC-c.md', story({ id: 'STORY-CCCCCCCC', status: 'cancelled', epic: 'EPIC-BBBBBBBB' }));
    return scanWorkspace(paths);
  }

  it('warns about off-path moves, incomplete dependencies, and unchecked criteria', async () => {
    const scan = await workspace();
    const a = getArtifact(scan, 'STORY-AAAAAAAA');
    expect(reviewTransition(scan, a, 'ready')).toEqual({
      warnings: ['depends on STORY-BBBBBBBB A story (in-progress)'],
      blockers: [],
    });
    const done = reviewTransition(scan, a, 'done');
    expect(done.blockers).toEqual([]);
    expect(done.warnings).toEqual([
      'backlog -> done is outside the recommended flow (backlog -> ready -> in-progress -> in-review -> done)',
      '1 acceptance criterion is still unchecked; check them only after verifying them',
      'depends on STORY-BBBBBBBB A story (in-progress)',
    ]);
    expect(reviewTransition(scan, a, 'cancelled')).toEqual({ warnings: [], blockers: [] });
    expect(reviewTransition(scan, a, 'backlog')).toEqual({ warnings: [], blockers: [] });
  });

  it('an epic with unfinished stories cannot close cleanly; cancelled stories do not count', async () => {
    const scan = await workspace();
    expect(reviewTransition(scan, getArtifact(scan, 'EPIC-AAAAAAAA'), 'done').blockers[0]).toMatch(
      /EPIC-AAAAAAAA has unfinished stories: STORY-AAAAAAAA \(backlog\)/,
    );
    expect(reviewTransition(scan, getArtifact(scan, 'EPIC-AAAAAAAA'), 'cancelled').blockers).toEqual([]);
    expect(reviewTransition(scan, getArtifact(scan, 'EPIC-BBBBBBBB'), 'done').blockers[0]).toMatch(/STORY-BBBBBBBB \(in-progress\)$|STORY-BBBBBBBB \(in-progress\)\./);
  });
});
