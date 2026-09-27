import { DECISION_STATUSES, EPIC_STATUSES, STORY_STATUSES } from './constants';
import { acceptanceCriteria, incompleteDependencies, isOpenStory, storiesForEpic } from './queries';
import type { WorkScan } from './scanner';
import type { Artifact, ArtifactType, DecisionStatus, EpicStatus, StoryStatus } from './types';

type Edges<S extends string> = Partial<Record<S, readonly S[]>>;

/**
 * Recommended story flow: backlog → ready → in-progress → in-review → done,
 * plus blocking, unblocking, rework, reopening, and cancelling any active
 * story. `in-progress → done` is normal where the repository has no review
 * step. Other moves are allowed with a warning: the workflow is a default,
 * not a prison.
 */
const STORY_EDGES: Edges<StoryStatus> = {
  backlog: ['ready', 'cancelled'],
  ready: ['in-progress', 'blocked', 'cancelled'],
  'in-progress': ['in-review', 'done', 'blocked', 'cancelled'],
  'in-review': ['done', 'in-progress', 'blocked', 'cancelled'],
  blocked: ['ready', 'in-progress', 'cancelled'],
  done: ['in-progress'],
};

const EPIC_EDGES: Edges<EpicStatus> = {
  proposed: ['active', 'cancelled'],
  active: ['done', 'cancelled'],
  done: ['active'],
};

const DECISION_EDGES: Edges<DecisionStatus> = {
  proposed: ['accepted', 'rejected'],
  accepted: ['superseded'],
};

export function canTransitionStory(from: StoryStatus, to: StoryStatus): boolean {
  return from === to || !!STORY_EDGES[from]?.includes(to);
}

export function canTransitionEpic(from: EpicStatus, to: EpicStatus): boolean {
  return from === to || !!EPIC_EDGES[from]?.includes(to);
}

export function canTransitionDecision(from: DecisionStatus, to: DecisionStatus): boolean {
  return from === to || !!DECISION_EDGES[from]?.includes(to);
}

export function statusesFor(type: ArtifactType): readonly string[] {
  return type === 'story' ? STORY_STATUSES : type === 'epic' ? EPIC_STATUSES : DECISION_STATUSES;
}

export function isValidStatus(type: ArtifactType, status: string): boolean {
  return statusesFor(type).includes(status);
}

export interface TransitionReview {
  /** Informational: the move is outside the recommended flow, or the new state looks premature. */
  warnings: string[];
  /** Reasons the move cannot be applied cleanly (override with `force`). */
  blockers: string[];
}

/**
 * Deterministic checks for a status change. Invalid status values are
 * rejected by the caller; this never changes anything, it only reports.
 */
export function reviewTransition(scan: WorkScan, artifact: Artifact, to: string): TransitionReview {
  const review: TransitionReview = { warnings: [], blockers: [] };
  const from = artifact.status;
  if (from === to) return review;

  if (artifact.type === 'story') {
    const target = to as StoryStatus;
    if (!canTransitionStory(artifact.status, target)) {
      review.warnings.push(`${from} -> ${to} is outside the recommended flow (backlog -> ready -> in-progress -> in-review -> done)`);
    }
    if (target === 'done') {
      const criteria = acceptanceCriteria(artifact.body);
      if (criteria.unchecked.length) {
        review.warnings.push(
          `${criteria.unchecked.length} acceptance criteri${criteria.unchecked.length === 1 ? 'on is' : 'a are'} still unchecked; check them only after verifying them`,
        );
      }
    }
    if (target === 'ready' || target === 'in-progress' || target === 'in-review' || target === 'done') {
      for (const dep of incompleteDependencies(scan, artifact)) {
        review.warnings.push(
          dep.story
            ? `depends on ${dep.story.id} ${dep.story.title} (${dep.story.status})`
            : `depends on ${dep.id}, which does not exist`,
        );
      }
    }
  } else if (artifact.type === 'epic') {
    const target = to as EpicStatus;
    if (!canTransitionEpic(artifact.status, target)) {
      review.warnings.push(`${from} -> ${to} is outside the recommended flow (proposed -> active -> done)`);
    }
    if (target === 'done') {
      const open = storiesForEpic(scan, artifact.id).filter(isOpenStory);
      if (open.length) {
        review.blockers.push(
          `${artifact.id} has unfinished stories: ${open.map((s) => `${s.id} (${s.status})`).join(', ')}. Finish or cancel them first.`,
        );
      }
    }
  } else if (!canTransitionDecision(artifact.status, to as DecisionStatus)) {
    review.warnings.push(`${from} -> ${to} is outside the recommended flow (proposed -> accepted -> superseded)`);
  }
  return review;
}
