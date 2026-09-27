import { BOARD_STATUSES, HORIZONS, OPEN_STORY_STATUSES, PRIORITIES } from './constants';
import { duplicateIdError, resolvePartialId } from './ids';
import { WorkError } from './paths';
import { type WorkScan } from './scanner';
import type { Artifact, ArtifactType, Decision, Epic, Horizon, Story, StoryStatus } from './types';

export interface StoryFilter {
  status?: StoryStatus | StoryStatus[];
  epic?: string;
}

const priorityRank = (p?: string) => (p ? PRIORITIES.indexOf(p as never) : PRIORITIES.length);
const collator = new Intl.Collator();

/** Priority first (p0..p3, then none), then title. */
export function byPriority<T extends { priority?: string; title: string; id: string }>(a: T, b: T): number {
  return priorityRank(a.priority) - priorityRank(b.priority) || collator.compare(a.title, b.title) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Index: built once per scan so every query is a map lookup, not a full scan.
// ---------------------------------------------------------------------------

interface WorkIndex {
  sizes: string;
  byId: Map<string, Artifact[]>;
  stories: Map<string, Story>;
  /** All stories, sorted by priority. */
  sortedStories: Story[];
  /** Stories per epic ID, sorted by priority. */
  storiesByEpic: Map<string, Story[]>;
  /** Stories that list the key in depends_on, sorted by priority. */
  dependents: Map<string, Story[]>;
  /** Decisions whose `related` mentions the key. */
  decisionsByRelated: Map<string, Decision[]>;
}

const indexes = new WeakMap<WorkScan, WorkIndex>();

const push = <K, V>(map: Map<K, V[]>, key: K, value: V) => {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
};

function index(scan: WorkScan): WorkIndex {
  const sizes = `${scan.epics.length}/${scan.stories.length}/${scan.decisions.length}`;
  const cached = indexes.get(scan);
  if (cached && cached.sizes === sizes) return cached;
  const idx: WorkIndex = {
    sizes,
    byId: new Map(),
    stories: new Map(),
    sortedStories: [...scan.stories].sort(byPriority),
    storiesByEpic: new Map(),
    dependents: new Map(),
    decisionsByRelated: new Map(),
  };
  for (const a of [...scan.epics, ...scan.stories, ...scan.decisions]) push(idx.byId, a.id, a);
  for (const s of scan.stories) if (!idx.stories.has(s.id)) idx.stories.set(s.id, s);
  for (const s of idx.sortedStories) {
    if (s.epic) push(idx.storiesByEpic, s.epic, s);
    for (const dep of new Set(s.depends_on ?? [])) push(idx.dependents, dep, s);
  }
  for (const d of scan.decisions) for (const r of new Set(d.related ?? [])) push(idx.decisionsByRelated, r, d);
  indexes.set(scan, idx);
  return idx;
}

export function listStories(scan: WorkScan, filter: StoryFilter = {}): Story[] {
  const statuses = filter.status === undefined ? null : Array.isArray(filter.status) ? filter.status : [filter.status];
  const idx = index(scan);
  const pool = filter.epic ? (idx.storiesByEpic.get(filter.epic) ?? []) : idx.sortedStories;
  return statuses ? pool.filter((s) => statuses.includes(s.status)) : [...pool];
}

export function listEpics(scan: WorkScan, filter: { status?: Epic['status']; horizon?: Horizon } = {}): Epic[] {
  return scan.epics
    .filter((e) => !filter.status || e.status === filter.status)
    .filter((e) => !filter.horizon || e.horizon === filter.horizon)
    .sort(byPriority);
}

export function listDecisions(scan: WorkScan, filter: { status?: Decision['status'] } = {}): Decision[] {
  return scan.decisions.filter((d) => !filter.status || d.status === filter.status).sort((a, b) => collator.compare(a.title, b.title));
}

/** Every artifact with this exact ID (more than one means a duplicate ID). */
export function artifactsWithId(scan: WorkScan, id: string): Artifact[] {
  return [...(index(scan).byId.get(id) ?? [])];
}

/**
 * Resolve a full or partial ID to one artifact. Refuses ambiguous prefixes and
 * IDs used by more than one file (listing the files) instead of picking one.
 */
export function getArtifact(scan: WorkScan, idOrPrefix: string, type?: ArtifactType): Artifact {
  const idx = index(scan);
  const id = resolvePartialId(idOrPrefix, idx.byId.keys(), type);
  const found = idx.byId.get(id)!;
  if (found.length > 1) throw duplicateIdError(id, found.length, found.map((a) => a.path));
  return found[0]!;
}

export function getStory(scan: WorkScan, idOrPrefix: string): Story {
  return getArtifact(scan, idOrPrefix, 'story') as Story;
}

export function getEpic(scan: WorkScan, idOrPrefix: string): Epic {
  return getArtifact(scan, idOrPrefix, 'epic') as Epic;
}

export function getDecision(scan: WorkScan, idOrPrefix: string): Decision {
  return getArtifact(scan, idOrPrefix, 'decision') as Decision;
}

/** Stories whose `epic` is this epic (the single source of the relationship). */
export function storiesForEpic(scan: WorkScan, epicId: string): Story[] {
  return [...(index(scan).storiesByEpic.get(epicId) ?? [])];
}

export interface Dependency {
  id: string;
  /** The story, when it exists. */
  story: Story | null;
}

export function dependenciesForStory(scan: WorkScan, story: Story): Dependency[] {
  const stories = index(scan).stories;
  return (story.depends_on ?? []).map((id) => ({ id, story: stories.get(id) ?? null }));
}

export function dependentsOfStory(scan: WorkScan, storyId: string): Story[] {
  return [...(index(scan).dependents.get(storyId) ?? [])];
}

export function readyStories(scan: WorkScan): Story[] {
  return listStories(scan, { status: 'ready' });
}

export function blockedStories(scan: WorkScan): Story[] {
  return listStories(scan, { status: 'blocked' });
}

/** Dependencies of a story that are not done yet (missing ones count as incomplete). */
export function incompleteDependencies(scan: WorkScan, story: Story): Dependency[] {
  return dependenciesForStory(scan, story).filter((d) => d.story?.status !== 'done');
}

/** Decisions whose `related` list mentions this artifact. */
export function decisionsFor(scan: WorkScan, id: string): Decision[] {
  return [...(index(scan).decisionsByRelated.get(id) ?? [])];
}

/** Statuses from which a story can be picked up next (not started yet). */
export const STARTABLE_STORY_STATUSES = ['ready', 'backlog'] as const;

export interface StoryReadiness {
  /** Every `depends_on` story exists and is done (true when there are none). */
  dependenciesDone: boolean;
  /** IDs of dependencies that are not done yet, or do not exist. */
  waitingOn: string[];
  /** Not started (`ready` or `backlog`) and every dependency is done: it can be picked up now. */
  ready: boolean;
}

/** Whether a story can be started now. Derived from frontmatter; nothing is stored. */
export function storyReadiness(scan: WorkScan, story: Story): StoryReadiness {
  const waitingOn = incompleteDependencies(scan, story).map((d) => d.id);
  const dependenciesDone = waitingOn.length === 0;
  return { dependenciesDone, waitingOn, ready: dependenciesDone && (STARTABLE_STORY_STATUSES as readonly string[]).includes(story.status) };
}

/**
 * Stories that can be picked up now: `ready` or `backlog`, and every
 * dependency done. `ready` stories come first, then `backlog`, each by priority.
 * This is the queue external orchestrators and agents should draw from.
 */
export function readyToStart(scan: WorkScan, filter: { epic?: string } = {}): Story[] {
  const pool = listStories(scan, { epic: filter.epic });
  return STARTABLE_STORY_STATUSES.flatMap((status) => pool.filter((s) => s.status === status && storyReadiness(scan, s).dependenciesDone));
}

export function isOpenStory(story: Story): boolean {
  return (OPEN_STORY_STATUSES as readonly string[]).includes(story.status);
}

export interface CriteriaCount {
  total: number;
  checked: number;
  /** Text of each unchecked criterion. */
  unchecked: string[];
}

/**
 * Count Markdown checkboxes in the story's "Acceptance Criteria" section,
 * or in the whole body when there is no such section. Fenced code is ignored.
 */
export function acceptanceCriteria(body: string): CriteriaCount {
  const lines = body.split(/\r?\n/);
  let inFence = false;
  const visible: string[] = [];
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      visible.push('');
      continue;
    }
    visible.push(inFence ? '' : line);
  }
  const headingIdx = visible.findIndex((l) => /^#{1,6}\s+acceptance criteria\s*#*\s*$/i.test(l));
  let section = visible;
  if (headingIdx !== -1) {
    const level = /^#+/.exec(visible[headingIdx]!)![0].length;
    let end = visible.length;
    for (let i = headingIdx + 1; i < visible.length; i++) {
      const h = /^(#+)\s/.exec(visible[i]!);
      if (h && h[1]!.length <= level) {
        end = i;
        break;
      }
    }
    section = visible.slice(headingIdx + 1, end);
  }
  const count: CriteriaCount = { total: 0, checked: 0, unchecked: [] };
  for (const line of section) {
    const m = /^\s*(?:[-*+]|\d+[.)])\s+\[([ xX])\]\s*(.*)$/.exec(line);
    if (!m) continue;
    count.total++;
    if (m[1] === ' ') count.unchecked.push(m[2]!.trim());
    else count.checked++;
  }
  return count;
}

export interface EpicProgress {
  total: number;
  done: number;
  cancelled: number;
  open: number;
}

export function epicProgress(scan: WorkScan, epicId: string): EpicProgress {
  const stories = storiesForEpic(scan, epicId);
  const done = stories.filter((s) => s.status === 'done').length;
  const cancelled = stories.filter((s) => s.status === 'cancelled').length;
  return { total: stories.length, done, cancelled, open: stories.length - done - cancelled };
}

// ---------------------------------------------------------------------------
// Board (computed, never written to disk)
// ---------------------------------------------------------------------------

export type BoardStatus = (typeof BOARD_STATUSES)[number];

export interface BoardColumn {
  status: BoardStatus;
  stories: Story[];
}

export interface BoardEpic {
  epic: Epic;
  columns: BoardColumn[];
  progress: EpicProgress;
}

export interface BoardGroup {
  /** now / next / later, or `unscheduled` for open epics without a horizon. */
  horizon: Horizon | 'unscheduled';
  epics: BoardEpic[];
}

export interface BoardWarning {
  story: Story;
  dependency: Dependency;
}

export interface Board {
  groups: BoardGroup[];
  /** Open stories without an epic, or whose epic is closed or unknown. */
  standalone: BoardColumn[];
  /** Stories marked ready whose dependencies are not done. */
  warnings: BoardWarning[];
}

function columns(stories: Story[]): BoardColumn[] {
  return BOARD_STATUSES.map((status) => ({ status, stories: stories.filter((s) => s.status === status).sort(byPriority) })).filter(
    (c) => c.stories.length,
  );
}

/**
 * The board: open epics grouped by horizon, each with its open stories by
 * status, then standalone stories. Done and cancelled work is summarized in
 * epic progress, not listed. Derived from frontmatter on every call.
 */
export function buildBoard(scan: WorkScan): Board {
  const openEpics = scan.epics.filter((e) => e.status === 'proposed' || e.status === 'active');
  const groups: BoardGroup[] = [];
  for (const horizon of [...HORIZONS, 'unscheduled'] as const) {
    const epics = openEpics
      .filter((e) => (horizon === 'unscheduled' ? !e.horizon : e.horizon === horizon))
      .sort((a, b) => (a.status === b.status ? byPriority(a, b) : a.status === 'active' ? -1 : 1))
      .map((epic) => ({
        epic,
        columns: columns(storiesForEpic(scan, epic.id).filter(isOpenStory)),
        progress: epicProgress(scan, epic.id),
      }));
    if (epics.length) groups.push({ horizon, epics });
  }
  const openEpicIds = new Set(openEpics.map((e) => e.id));
  const standalone = columns(scan.stories.filter((s) => isOpenStory(s) && (!s.epic || !openEpicIds.has(s.epic))));
  const warnings: BoardWarning[] = [];
  for (const story of readyStories(scan)) {
    for (const dependency of incompleteDependencies(scan, story)) warnings.push({ story, dependency });
  }
  return { groups, standalone, warnings };
}

export function assertType(artifact: Artifact, type: ArtifactType): void {
  if (artifact.type !== type) throw new WorkError(`${artifact.id} is a ${artifact.type}, not a ${type}`);
}
