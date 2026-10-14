import { HORIZONS, PRIORITIES } from './constants';
import { artifactsWithId, dependentsOfStory, listStories } from './queries';
import type { WorkScan } from './scanner';
import type { Epic, Story } from './types';

/**
 * `agileflow work next`: which stories can be picked up now, and why. Derived
 * from frontmatter on every call; read-only. It never assigns, starts, or
 * changes anything.
 */

export interface NextCandidate {
  story: Story;
  /** Why it is eligible (eligible items) or why not (explained items), in plain words. */
  reasons: string[];
  /** Dependencies (all done for eligible items). */
  dependsOn: string[];
  /** Open stories that list this one in depends_on. */
  unblocks: string[];
  epic: Epic | null;
}

export interface NextResult {
  /** Eligible stories, best first, at most `limit`. */
  eligible: NextCandidate[];
  /** Number of eligible stories before `limit`. */
  totalEligible: number;
  /** With `explain`: the highest-priority open stories that are not eligible, with the reasons. */
  notEligible: NextCandidate[];
  /** Number of open, not-started stories that are not eligible. */
  totalNotEligible: number;
}

export interface NextOptions {
  /** Only stories of this epic (full ID). */
  epic?: string;
  /** Maximum eligible (and explained) stories to return; default 5. */
  limit?: number;
  /** Also explain why the top not-eligible stories are not eligible. */
  explain?: boolean;
}

const priorityRank = (p?: string) => (p ? PRIORITIES.indexOf(p as never) : PRIORITIES.length);
const horizonRank = (e: Epic | null) => (e?.horizon ? HORIZONS.indexOf(e.horizon) : HORIZONS.length);

/** Stories that are not started and not finished: the pool `next` looks at. */
const WAITING_STATUSES = ['ready', 'backlog', 'blocked'] as const;

/**
 * Rank and explain. Eligible means: status `ready`, not a duplicate ID, every
 * `depends_on` story exists (exactly once) and is `done`, and the epic (if
 * any) is not done or cancelled. Order: priority (p0 first, unset last), then
 * epic horizon (now, next, later, none), then how many open stories it
 * unblocks, then title and ID.
 */
export function nextStories(scan: WorkScan, options: NextOptions = {}): NextResult {
  const limit = options.limit ?? 5;
  const epics = new Map<string, Epic[]>();
  for (const e of scan.epics) epics.set(e.id, [...(epics.get(e.id) ?? []), e]);
  const pool = listStories(scan, { epic: options.epic }).filter((s) => (WAITING_STATUSES as readonly string[]).includes(s.status));

  const eligible: NextCandidate[] = [];
  const notEligible: NextCandidate[] = [];
  for (const story of pool) {
    const epicCopies = story.epic ? (epics.get(story.epic) ?? []) : [];
    const epic = epicCopies.length === 1 ? epicCopies[0]! : null;
    const unblocks = dependentsOfStory(scan, story.id)
      .filter((d) => d.status !== 'done' && d.status !== 'cancelled')
      .map((d) => d.id);
    const deps = [...new Set(story.depends_on ?? [])];
    const blockers: string[] = [];
    if (story.status === 'backlog') blockers.push('status is backlog: refine it and set it to ready first');
    if (story.status === 'blocked') blockers.push('status is blocked');
    if (artifactsWithId(scan, story.id).length > 1) blockers.push(`${story.id} is used by more than one file (duplicate ID)`);
    const waiting: string[] = [];
    for (const dep of deps) {
      const copies = artifactsWithId(scan, dep).filter((a) => a.type === 'story') as Story[];
      if (!copies.length) waiting.push(`${dep} does not exist`);
      else if (copies.length > 1) waiting.push(`${dep} has a duplicate ID`);
      else if (copies[0]!.status !== 'done') waiting.push(`${dep} is ${copies[0]!.status}`);
    }
    if (waiting.length) blockers.push(`waiting on ${waiting.join(', ')}`);
    if (story.epic) {
      if (!epicCopies.length) blockers.push(`epic ${story.epic} does not exist`);
      else if (epicCopies.length > 1) blockers.push(`epic ${story.epic} has a duplicate ID`);
      else if (epic!.status === 'done' || epic!.status === 'cancelled') blockers.push(`epic ${epic!.id} is ${epic!.status}`);
    }

    const candidate: NextCandidate = { story, reasons: blockers, dependsOn: deps, unblocks, epic };
    if (blockers.length) {
      notEligible.push(candidate);
      continue;
    }
    const reasons = [`status is ready${story.priority ? `, priority ${story.priority}` : ', no priority set'}`];
    reasons.push(deps.length ? `every dependency is done (${deps.join(', ')})` : 'no dependencies');
    if (epic) reasons.push(`epic ${epic.id} is ${epic.status}${epic.horizon ? `, horizon ${epic.horizon}` : ''}`);
    if (unblocks.length) reasons.push(`unblocks ${unblocks.length} open stor${unblocks.length === 1 ? 'y' : 'ies'} (${unblocks.slice(0, 5).join(', ')}${unblocks.length > 5 ? ', ...' : ''})`);
    candidate.reasons = reasons;
    eligible.push(candidate);
  }

  const order = (a: NextCandidate, b: NextCandidate) =>
    priorityRank(a.story.priority) - priorityRank(b.story.priority) ||
    horizonRank(a.epic) - horizonRank(b.epic) ||
    b.unblocks.length - a.unblocks.length ||
    (a.story.title < b.story.title ? -1 : a.story.title > b.story.title ? 1 : 0) ||
    (a.story.id < b.story.id ? -1 : a.story.id > b.story.id ? 1 : 0);
  eligible.sort(order);
  // Explain ready stories first (closest to eligible), then blocked, then backlog.
  const statusRank = (s: Story) => WAITING_STATUSES.indexOf(s.status as (typeof WAITING_STATUSES)[number]);
  notEligible.sort((a, b) => statusRank(a.story) - statusRank(b.story) || order(a, b));
  return {
    eligible: eligible.slice(0, limit),
    totalEligible: eligible.length,
    notEligible: options.explain ? notEligible.slice(0, limit) : [],
    totalNotEligible: notEligible.length,
  };
}
