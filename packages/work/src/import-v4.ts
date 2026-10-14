import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ID_PREFIX, OPEN_STORY_STATUSES } from './constants';
import { parse, serialize } from './frontmatter';
import { randomSuffix } from './ids';
import { artifactDir, artifactFileName, relToProject, WorkError } from './paths';
import { allArtifacts, type WorkScan } from './scanner';
import { artifactBody } from './templates';
import { capList, oneLine, stripTerminalEscapes } from './text';
import type { EpicStatus, Priority, StoryStatus } from './types';
import { findDependencyCycles } from './validate';

/**
 * Import a v4 AgileFlow backlog (`docs/05-epics`, `docs/06-stories`,
 * `docs/09-agents/status.json`) into Work items. Read-only on the v4 files:
 * nothing is ever deleted or changed there. Each imported item records its v4
 * ID in `legacy_id` and the files it came from in `legacy_source`, so running
 * the import again skips what is already there.
 *
 * Conservative by design: when status.json and the Markdown file disagree on
 * status, title, priority, or epic, the item is held back (not imported)
 * unless the caller chooses a side (`prefer`). New IDs are derived from the
 * legacy ID, so the preview shows exactly the IDs an import writes.
 */

export const V4_EPICS_DIR = 'docs/05-epics';
export const V4_STORIES_DIR = 'docs/06-stories';
export const V4_STATUS_FILE = 'docs/09-agents/status.json';

export interface PlannedImport {
  type: 'epic' | 'story';
  /** v4 ID, e.g. `EP-0007` or `US-0042`. Written as `legacy_id`. */
  legacyId: string;
  /** New Work ID, derived from the legacy ID (stable between preview and import). */
  id: string;
  title: string;
  /** Work status after mapping. */
  status: EpicStatus | StoryStatus;
  /** The v4 status as written (null when v4 had none). */
  legacyStatus: string | null;
  priority?: Priority;
  /** The v4 priority as written (null when v4 had none). */
  legacyPriority: string | null;
  /** Stories: Work ID of the epic (new or previously imported). */
  epic?: string;
  /** Stories: v4 ID of the epic. */
  legacyEpic?: string;
  /** Stories: Work IDs of dependencies. */
  dependsOn?: string[];
  /** Stories: v4 IDs of the dependencies that were kept. */
  legacyDependsOn?: string[];
  /** Target path relative to the project root. */
  path: string;
  /** v4 files the item was read from (status.json and/or a Markdown file). Written as `legacy_source`. */
  sources: string[];
  /** File contents to write. */
  content: string;
}

export interface SkippedImport {
  legacyId: string;
  type: 'epic' | 'story';
  /** Work ID that already carries this legacy_id. */
  existing: string;
}

/** One field on which status.json and the Markdown file disagree. */
export interface FieldConflict {
  field: 'title' | 'status' | 'priority' | 'epic';
  json: string;
  markdown: string;
}

/** An item that is not imported until a person decides. */
export interface ImportConflict {
  type: 'epic' | 'story';
  legacyId: string;
  /** The Work ID it will get once imported. */
  id: string;
  /** v4 files involved. */
  sources: string[];
  /** status.json vs Markdown disagreements (resolved by `prefer`). */
  fields: FieldConflict[];
  /** Other reasons (duplicate files, ambiguous references); `prefer` does not resolve these. */
  reasons: string[];
}

/** A v4 value the import writes differently (e.g. `todo` -> `ready`). */
export interface ImportRemap {
  type: 'epic' | 'story';
  field: 'status' | 'priority';
  from: string;
  to: string;
  /** v4 IDs of the planned items this applies to. */
  items: string[];
}

/** A legacy ID that more than one Work item already carries. */
export interface DuplicateLegacyId {
  legacyId: string;
  ids: string[];
  paths: string[];
}

export interface V4ImportPlan {
  /** Any v4 backlog source exists. */
  found: boolean;
  /** v4 sources that were read, relative to the project root. */
  sources: string[];
  epics: PlannedImport[];
  stories: PlannedImport[];
  /** Already imported (a Work item has this legacy_id). */
  skipped: SkippedImport[];
  /** Held back: not imported until the conflict is resolved (or `prefer` picks a side for field conflicts). */
  conflicts: ImportConflict[];
  /** v4 status and priority values that are written differently. */
  remaps: ImportRemap[];
  /** Legacy IDs used by more than one existing Work item; never guessed. */
  duplicates: DuplicateLegacyId[];
  /** The side chosen for field conflicts, when one was. */
  prefer: ImportPreference | null;
  /** Things the user should know: resolved conflicts, dropped references, adjustments. */
  notes: string[];
}

export type ImportPreference = 'json' | 'markdown';

export interface V4ImportOptions {
  /** Resolve status.json vs Markdown disagreements with this side. Without it, such items are held back. */
  prefer?: ImportPreference;
}

type Fields = { title?: string; status?: string; priority?: string; epic?: string };

interface V4Record {
  legacyId: string;
  /** Values from status.json. */
  json: Fields;
  /** Values from the Markdown file (frontmatter, then `**Field**:` lines, the heading, or the folder). */
  markdown: Fields;
  dependsOn: string[];
  criteria: string[];
  description?: string;
  summary?: string;
  body?: string;
  /** Markdown files that claim this ID (more than one is a conflict). */
  files: string[];
  sources: string[];
}

const EPIC_ID_RE = /^EP-\d+$/i;
const STORY_ID_RE = /^US-\d+$/i;

const norm = (s: string) => s.trim().toLowerCase().replace(/[\s_]+/g, '-');

const STORY_STATUS_MAP: Record<string, StoryStatus> = {};
const EPIC_STATUS_MAP: Record<string, EpicStatus> = {};
const add = <S extends string>(map: Record<string, S>, status: S, words: string[]) => {
  for (const w of words) map[w] = status;
};
add(STORY_STATUS_MAP, 'done', ['done', 'complete', 'completed', 'closed', 'finished', 'shipped', 'merged', 'resolved', 'released']);
add(STORY_STATUS_MAP, 'in-progress', ['in-progress', 'inprogress', 'active', 'started', 'doing', 'wip', 'implementing', 'in-development']);
add(STORY_STATUS_MAP, 'in-review', ['in-review', 'review', 'reviewing', 'needs-review', 'pr', 'pr-open', 'testing', 'qa']);
add(STORY_STATUS_MAP, 'ready', ['ready', 'todo', 'to-do', 'next']);
add(STORY_STATUS_MAP, 'blocked', ['blocked', 'on-hold', 'waiting']);
add(STORY_STATUS_MAP, 'cancelled', ['cancelled', 'canceled', 'wontfix', "won't-fix", 'rejected', 'dropped', 'abandoned', 'obsolete', 'superseded', 'duplicate']);
add(STORY_STATUS_MAP, 'backlog', ['backlog', 'deferred', 'planned', 'proposed', 'draft', 'new', 'open', 'pending', 'idea', 'later']);
add(EPIC_STATUS_MAP, 'done', ['done', 'complete', 'completed', 'closed', 'finished', 'shipped', 'released']);
add(EPIC_STATUS_MAP, 'active', ['active', 'in-progress', 'inprogress', 'started', 'doing', 'wip', 'in-review', 'review']);
add(EPIC_STATUS_MAP, 'proposed', ['proposed', 'planned', 'planning', 'ready', 'todo', 'backlog', 'draft', 'deferred', 'new', 'open', 'pending', 'idea', 'blocked', 'on-hold']);
add(EPIC_STATUS_MAP, 'cancelled', ['cancelled', 'canceled', 'rejected', 'dropped', 'abandoned', 'obsolete', 'superseded']);

/** Map a v4 story status onto the Work lifecycle. Unknown values become `backlog`. */
export function mapV4StoryStatus(status: string | undefined): { status: StoryStatus; known: boolean } {
  if (!status?.trim()) return { status: 'backlog', known: true };
  const mapped = STORY_STATUS_MAP[norm(status)];
  return mapped ? { status: mapped, known: true } : { status: 'backlog', known: false };
}

/** Map a v4 epic status onto the Work lifecycle. Unknown values become `proposed`. */
export function mapV4EpicStatus(status: string | undefined): { status: EpicStatus; known: boolean } {
  if (!status?.trim()) return { status: 'proposed', known: true };
  const mapped = EPIC_STATUS_MAP[norm(status)];
  return mapped ? { status: mapped, known: true } : { status: 'proposed', known: false };
}

/** `P1`, `high`, `High (foundation...)` -> `p1`. Unknown or empty -> undefined. */
export function mapV4Priority(priority: unknown): Priority | undefined {
  if (typeof priority !== 'string' && typeof priority !== 'number') return undefined;
  const word = String(priority).trim().toLowerCase().split(/[^a-z0-9]+/)[0] ?? '';
  if (/^p[0-3]$/.test(word)) return word as Priority;
  if (['critical', 'urgent', 'highest', 'blocker', 'p0'].includes(word)) return 'p0';
  if (word === 'high') return 'p1';
  if (['medium', 'normal', 'med', 'moderate'].includes(word)) return 'p2';
  if (['low', 'lowest', 'minor', 'trivial'].includes(word)) return 'p3';
  return undefined;
}

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : undefined);
const idList = (...values: unknown[]): string[] => {
  const out: string[] = [];
  for (const v of values) {
    const list = Array.isArray(v) ? v : typeof v === 'string' ? v.split(/[\s,]+/) : [];
    for (const item of list) {
      const s = str(item)?.toUpperCase();
      if (s && STORY_ID_RE.test(s) && !out.includes(s)) out.push(s);
    }
  }
  return out;
};
const textList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (typeof x === 'string' ? x : x && typeof x === 'object' ? str((x as Record<string, unknown>).text ?? (x as Record<string, unknown>).title) : str(x))).filter((x): x is string => !!x?.trim()) : [];

/** `**Status**: Complete` style lines used by older v4 files without frontmatter. */
function boldField(body: string, name: string): string | undefined {
  const m = new RegExp(`^\\*\\*${name}\\*\\*\\s*:\\s*(.+)$`, 'im').exec(body);
  return m ? m[1]!.replace(/\*\*/g, '').trim() : undefined;
}

/** `# US-0042: Title` / `# EP-0007 - Title` -> `Title`. */
function headingTitle(body: string, legacyId: string): string | undefined {
  const m = /^#\s+(.+)$/m.exec(body);
  if (!m) return undefined;
  const escaped = legacyId.replace(/-/g, '[-_ ]?');
  const title = m[1]!.replace(new RegExp(`^${escaped}\\s*[:\\-–—.]?\\s*`, 'i'), '').trim();
  return title || undefined;
}

async function readText(file: string): Promise<string | null> {
  try {
    return await fs.promises.readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT' || (err as NodeJS.ErrnoException).code === 'ENOTDIR') return null;
    throw err;
  }
}

async function markdownFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string) => {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(d, { withFileTypes: true });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT' || (err as NodeJS.ErrnoException).code === 'ENOTDIR') return;
      throw err;
    }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.name.startsWith('.')) continue;
      const abs = path.join(d, e.name);
      if (e.isDirectory()) await walk(abs);
      else if (e.isFile() && e.name.toLowerCase().endsWith('.md') && e.name.toLowerCase() !== 'readme.md') out.push(abs);
    }
  };
  await walk(dir);
  return out;
}

interface V4Backlog {
  found: boolean;
  sources: string[];
  epics: Map<string, V4Record>;
  stories: Map<string, V4Record>;
  notes: string[];
}

const record = (map: Map<string, V4Record>, legacyId: string): V4Record => {
  let r = map.get(legacyId);
  if (!r) {
    r = { legacyId, json: {}, markdown: {}, dependsOn: [], criteria: [], files: [], sources: [] };
    map.set(legacyId, r);
  }
  return r;
};

/** Read every v4 backlog source under the project root. Never writes. */
export async function readV4Backlog(projectRoot: string): Promise<V4Backlog> {
  const backlog: V4Backlog = { found: false, sources: [], epics: new Map(), stories: new Map(), notes: [] };
  const rel = (abs: string) => path.relative(projectRoot, abs).split(path.sep).join('/');

  // 1. status.json: the v4 source of truth for status.
  const statusFile = path.join(projectRoot, ...V4_STATUS_FILE.split('/'));
  const statusText = await readText(statusFile);
  if (statusText !== null) {
    backlog.found = true;
    backlog.sources.push(V4_STATUS_FILE);
    let json: Record<string, unknown>;
    try {
      json = JSON.parse(statusText) as Record<string, unknown>;
    } catch (err) {
      throw new WorkError(`${V4_STATUS_FILE} is not valid JSON (${(err as Error).message})`, ['Nothing was imported. Fix or move the file, then run the import again.']);
    }
    const entries = (value: unknown, idKey: string): Array<[string, Record<string, unknown>]> => {
      if (Array.isArray(value)) {
        return value
          .filter((v): v is Record<string, unknown> => !!v && typeof v === 'object')
          .map((v) => [String(v[idKey] ?? v.id ?? ''), v]);
      }
      if (value && typeof value === 'object') {
        return Object.entries(value as Record<string, unknown>).filter((e): e is [string, Record<string, unknown>] => !!e[1] && typeof e[1] === 'object');
      }
      return [];
    };
    // v4 sometimes wrote entries at the top level next to `stories`/`epics`; merge them (nested wins).
    const topLevel = Object.entries(json).filter((e): e is [string, Record<string, unknown>] => !!e[1] && typeof e[1] === 'object' && !Array.isArray(e[1]));
    const epicEntries = [...topLevel.filter(([k]) => EPIC_ID_RE.test(k)), ...entries(json.epics, 'epic_id')];
    const storyEntries = [...topLevel.filter(([k]) => STORY_ID_RE.test(k)), ...entries(json.stories, 'story_id')];
    for (const [key, v] of epicEntries) {
      const id = key.trim().toUpperCase();
      if (!EPIC_ID_RE.test(id)) continue;
      const r = record(backlog.epics, id);
      r.json.title = str(v.title) ?? r.json.title;
      r.json.status = str(v.status) ?? r.json.status;
      r.json.priority = str(v.priority) ?? r.json.priority;
      r.description = str(v.goal) ?? str(v.description) ?? r.description;
      r.summary = str(v.summary) ?? r.summary;
      if (!r.sources.includes(V4_STATUS_FILE)) r.sources.push(V4_STATUS_FILE);
    }
    for (const [key, v] of storyEntries) {
      const id = key.trim().toUpperCase();
      if (!STORY_ID_RE.test(id)) continue;
      const r = record(backlog.stories, id);
      r.json.title = str(v.title) ?? r.json.title;
      r.json.status = str(v.status) ?? r.json.status;
      r.json.priority = str(v.priority) ?? r.json.priority;
      r.json.epic = str(v.epic)?.toUpperCase() ?? r.json.epic;
      r.dependsOn = idList(v.depends_on, v.dependencies, v.blocked_by, v.dependsOn);
      const criteria = textList(v.acceptance_criteria).length ? textList(v.acceptance_criteria) : textList(v.ac);
      if (criteria.length) r.criteria = criteria;
      r.description = str(v.description) ?? r.description;
      r.summary = str(v.summary) ?? r.summary;
      if (!r.sources.includes(V4_STATUS_FILE)) r.sources.push(V4_STATUS_FILE);
    }
  }

  // 2. Markdown files: bodies, plus their own view of the fields (compared with status.json later).
  const readFiles = async (dir: string, type: 'epic' | 'story') => {
    const files = await markdownFiles(path.join(projectRoot, ...dir.split('/')));
    if (files.length) {
      backlog.found = true;
      backlog.sources.push(dir);
    }
    for (const abs of files) {
      const text = await readText(abs);
      if (text === null) continue;
      const doc = parse(text);
      const fm = doc.data ?? {};
      const body = doc.data ? doc.body : text;
      const idRe = type === 'epic' ? /^(EP-\d+)/i : /^(US-\d+)/i;
      const idRaw = str(type === 'epic' ? (fm.epic_id ?? fm.id) : (fm.story_id ?? fm.id)) ?? idRe.exec(path.basename(abs))?.[1];
      const legacyId = idRaw?.toUpperCase();
      if (!legacyId || !(type === 'epic' ? EPIC_ID_RE : STORY_ID_RE).test(legacyId)) {
        backlog.notes.push(`${rel(abs)}: no v4 ${type === 'epic' ? 'EP-' : 'US-'} ID found; not imported`);
        continue;
      }
      const map = type === 'epic' ? backlog.epics : backlog.stories;
      const r = record(map, legacyId);
      r.files.push(rel(abs));
      if (r.body !== undefined) continue; // a second file for the same ID: reported as a conflict
      r.body = body;
      r.sources.push(rel(abs));
      r.markdown.title = str(fm.title) ?? headingTitle(body, legacyId);
      r.markdown.status = str(fm.status) ?? boldField(body, 'Status');
      r.markdown.priority = str(fm.priority) ?? boldField(body, 'Priority');
      if (type === 'story') {
        const parentDir = path.basename(path.dirname(abs)).toUpperCase();
        const epicLine = boldField(body, 'Epic');
        r.markdown.epic =
          str(fm.epic)?.toUpperCase() ??
          str(fm.epic_id)?.toUpperCase() ??
          (EPIC_ID_RE.test(parentDir) ? parentDir : undefined) ??
          (epicLine ? /EP-\d+/i.exec(epicLine)?.[0]?.toUpperCase() : undefined);
        if (!r.dependsOn.length) r.dependsOn = idList(fm.depends_on, fm.dependencies, fm.blocked_by);
      } else {
        r.description ??= str(fm.goal);
      }
    }
  };
  await readFiles(V4_EPICS_DIR, 'epic');
  await readFiles(V4_STORIES_DIR, 'story');
  return backlog;
}

/** Text copied from v4 into Work files: terminal escape sequences and control characters removed. */
const cleanText = (s: string) => stripTerminalEscapes(s);

function generatedBody(type: 'epic' | 'story', title: string, r: V4Record, done: boolean): string {
  const sections: string[] = [];
  if (r.description) sections.push(`## ${type === 'epic' ? 'Outcome' : 'Why'}\n\n${cleanText(r.description)}\n`);
  if (type === 'story' && r.criteria.length) {
    sections.push(`## Acceptance Criteria\n\n${r.criteria.map((c) => `- [${done ? 'x' : ' '}] ${oneLine(c)}`).join('\n')}\n`);
  }
  if (r.summary) sections.push(`## Notes\n\n${cleanText(r.summary)}\n`);
  if (!sections.length) return artifactBody(type, title);
  return `# ${title}\n\n${sections.join('\n')}`;
}

/**
 * Remove v4 `**Status**: ...` lines (outside fenced code) from an imported
 * body: the frontmatter status is authoritative and the line would go stale.
 * The original stays in the v4 file named in `legacy_source`.
 */
export function stripV4StatusLines(body: string): { body: string; removed: number } {
  let inFence = false;
  let removed = 0;
  const lines = body.split('\n').filter((line) => {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (!inFence && /^\s*\*\*Status\*\*\s*:/i.test(line)) {
      removed++;
      return false;
    }
    return true;
  });
  return { body: lines.join('\n'), removed };
}

/**
 * The Work ID an imported item gets: derived from its type and legacy ID
 * (SHA-256, Crockford Base32), so a preview and the import that follows show
 * and write the same IDs, and two imports of the same backlog agree. On a
 * clash with an ID already in use, the next derivation is tried.
 */
export function importedId(type: 'epic' | 'story', legacyId: string, taken: Set<string>): string {
  for (let n = 0; ; n++) {
    const digest = crypto.createHash('sha256').update(`agileflow-work-import:v4:${type}:${legacyId.toUpperCase()}${n ? `:${n}` : ''}`).digest();
    const id = `${ID_PREFIX[type]}-${randomSuffix((size) => digest.subarray(0, size))}`;
    if (!taken.has(id)) return id;
  }
}

const sameText = (a: string, b: string) => oneLine(a).toLowerCase().replace(/[.\s]+$/, '') === oneLine(b).toLowerCase().replace(/[.\s]+$/, '');

/** Compare the status.json and Markdown views of a record; return the chosen values and any disagreements. */
function reconcile(type: 'epic' | 'story', r: V4Record): { values: Fields; conflicts: FieldConflict[] } {
  const conflicts: FieldConflict[] = [];
  const values: Fields = {};
  const mapStatus = (s: string) => (type === 'story' ? mapV4StoryStatus(s).status : mapV4EpicStatus(s).status);
  const same: Record<keyof Fields, (a: string, b: string) => boolean> = {
    title: sameText,
    status: (a, b) => mapStatus(a) === mapStatus(b),
    priority: (a, b) => mapV4Priority(a) === mapV4Priority(b),
    epic: (a, b) => a.toUpperCase() === b.toUpperCase(),
  };
  for (const field of ['title', 'status', 'priority', 'epic'] as const) {
    const j = r.json[field];
    const m = r.markdown[field];
    values[field] = j ?? m;
    if (j !== undefined && m !== undefined && !same[field](j, m)) conflicts.push({ field, json: oneLine(j), markdown: oneLine(m) });
  }
  return { values, conflicts };
}

const byNumber = (a: string, b: string) => Number(a.split('-')[1]) - Number(b.split('-')[1]) || (a < b ? -1 : 1);
const sortIds = (ids: Iterable<string>) => [...ids].sort(byNumber);
const isOpen = (status: string) => (OPEN_STORY_STATUSES as readonly string[]).includes(status);

/**
 * Work out what `work import v4` would create. Nothing is written. IDs are
 * derived from legacy IDs, so applying the plan later writes the same IDs.
 */
export async function planV4Import(scan: WorkScan, options: V4ImportOptions = {}): Promise<V4ImportPlan> {
  const { projectRoot } = scan.paths;
  const backlog = await readV4Backlog(projectRoot);
  const prefer = options.prefer ?? null;
  const plan: V4ImportPlan = {
    found: backlog.found,
    sources: backlog.sources,
    epics: [],
    stories: [],
    skipped: [],
    conflicts: [],
    remaps: [],
    duplicates: [],
    prefer,
    notes: [...backlog.notes],
  };
  if (!backlog.found) return plan;

  const taken = new Set(allArtifacts(scan).map((a) => a.id));
  // Existing Work items by legacy ID. More than one item with the same legacy ID is never guessed.
  const claimed = new Map<string, Array<{ id: string; path: string; type: 'epic' | 'story' }>>();
  for (const a of [...scan.epics, ...scan.stories]) {
    if (!a.legacy_id) continue;
    const key = a.legacy_id.trim().toUpperCase();
    claimed.set(key, [...(claimed.get(key) ?? []), { id: a.id, path: a.path, type: a.type }]);
  }
  for (const [legacyId, items] of claimed) {
    if (items.length < 2) continue;
    plan.duplicates.push({ legacyId, ids: items.map((i) => i.id), paths: items.map((i) => i.path) });
  }
  const ambiguous = new Set(plan.duplicates.map((d) => d.legacyId));

  // IDs for everything in the v4 backlog, per type (an epic link never resolves to a story):
  // existing ones for imported items, derived ones for the rest.
  const workIds = { epic: new Map<string, string>(), story: new Map<string, string>() };
  for (const [type, map] of [['epic', backlog.epics], ['story', backlog.stories]] as const) {
    for (const legacyId of sortIds(map.keys())) {
      const existing = claimed.get(legacyId);
      if (existing?.length) {
        if (existing.length === 1 && existing[0]!.type === type) workIds[type].set(legacyId, existing[0]!.id);
        plan.skipped.push({ legacyId, type, existing: existing.map((e) => e.id).join(', ') });
        continue;
      }
      const id = importedId(type, legacyId, taken);
      taken.add(id);
      workIds[type].set(legacyId, id);
    }
  }

  // Files already named after a planned ID that the scan could not load (invalid
  // frontmatter, e.g. from an earlier import) would collide: hold those items back.
  const onDisk: Record<'epic' | 'story', string[]> = { epic: [], story: [] };
  for (const type of ['epic', 'story'] as const) {
    onDisk[type] = await fs.promises.readdir(artifactDir(scan.paths, type)).catch(() => [] as string[]);
  }
  const occupied = (type: 'epic' | 'story', legacyId: string): string[] => {
    const id = workIds[type].get(legacyId);
    if (!id) return [];
    const file = onDisk[type].find((name) => name === `${id}.md` || name.startsWith(`${id}-`));
    return file
      ? [
          `${relToProject(scan.paths, path.join(artifactDir(scan.paths, type), file))} already uses its new ID ${id} but is not a valid work item (see \`agileflow check\`); fix or remove it, then import again`,
        ]
      : [];
  };

  const remaps = new Map<string, ImportRemap>();
  const remap = (type: 'epic' | 'story', field: 'status' | 'priority', from: string | undefined, to: string | undefined, legacyId: string) => {
    if (!from || !to || norm(from) === to) return;
    const key = `${type}\0${field}\0${from}\0${to}`;
    const entry = remaps.get(key) ?? { type, field, from: oneLine(from), to, items: [] };
    entry.items.push(legacyId);
    remaps.set(key, entry);
  };
  let strippedStatusLines = 0;

  /** Decide an item's fields, or hold it back. Returns null when held back. */
  const decide = (type: 'epic' | 'story', r: V4Record, reasons: string[]): Fields | null => {
    const { values, conflicts } = reconcile(type, r);
    if (r.files.length > 1) reasons.push(`${r.files.length} Markdown files claim ${r.legacyId}: ${r.files.join(', ')}`);
    if (reasons.length || (conflicts.length && !prefer)) {
      plan.conflicts.push({ type, legacyId: r.legacyId, id: workIds[type].get(r.legacyId)!, sources: [...new Set([...r.sources, ...r.files])], fields: conflicts, reasons });
      return null;
    }
    for (const c of conflicts) {
      values[c.field] = prefer === 'json' ? r.json[c.field] : r.markdown[c.field];
      plan.notes.push(`${r.legacyId}: status.json and Markdown disagree on ${c.field} ("${c.json}" vs "${c.markdown}"); using ${prefer === 'json' ? 'status.json' : 'Markdown'} (--prefer ${prefer})`);
    }
    return values;
  };

  const body = (type: 'epic' | 'story', title: string, r: V4Record, done: boolean) => {
    if (r.body === undefined) return generatedBody(type, title, r, done);
    const { body: text, removed } = stripV4StatusLines(cleanText(r.body));
    strippedStatusLines += removed;
    return text;
  };

  // Decide epics first so stories know which epics are held back.
  const epicValues = new Map<string, Fields | null>();
  for (const legacyId of sortIds(backlog.epics.keys())) {
    if (!claimed.has(legacyId)) epicValues.set(legacyId, decide('epic', backlog.epics.get(legacyId)!, occupied('epic', legacyId)));
  }

  // Then stories, so links to held-back stories can be reported.
  const storyValues = new Map<string, Fields | null>();
  for (const legacyId of sortIds(backlog.stories.keys())) {
    if (claimed.has(legacyId)) continue;
    const r = backlog.stories.get(legacyId)!;
    const reasons: string[] = occupied('story', legacyId);
    const epicRef = reconcile('story', r).values.epic;
    if (epicRef && ambiguous.has(epicRef)) reasons.push(`its epic ${epicRef} is the legacy_id of more than one Work item`);
    for (const dep of r.dependsOn) if (ambiguous.has(dep)) reasons.push(`it depends on ${dep}, the legacy_id of more than one Work item`);
    storyValues.set(legacyId, decide('story', r, reasons));
  }

  // Stories before writing epics: epics that would be done with open stories are imported as active.
  const openByEpic = new Map<string, string[]>();
  for (const legacyId of sortIds(backlog.stories.keys())) {
    const values = storyValues.get(legacyId);
    if (!values) continue;
    const r = backlog.stories.get(legacyId)!;
    const title = oneLine(values.title ?? '') || legacyId;
    const { status, known } = mapV4StoryStatus(values.status);
    if (!known) plan.notes.push(`${legacyId}: unknown v4 status "${oneLine(values.status!)}"; imported as backlog`);
    else remap('story', 'status', values.status, status, legacyId);
    let epic: string | undefined;
    if (values.epic && !EPIC_ID_RE.test(values.epic)) {
      plan.notes.push(`${legacyId}: its epic "${oneLine(values.epic)}" is not a v4 epic ID (EP-...); link dropped, imported as a standalone story`);
    } else if (values.epic) {
      epic = workIds.epic.get(values.epic);
      if (!epic) plan.notes.push(`${legacyId}: epic ${values.epic} was not found in the v4 backlog; imported as a standalone story`);
      else if (epicValues.get(values.epic) === null) {
        plan.notes.push(`${legacyId}: its epic ${values.epic} is held back by a conflict; the link resolves once ${values.epic} is imported`);
      }
    }
    const dependsOn: string[] = [];
    const legacyDependsOn: string[] = [];
    for (const dep of r.dependsOn) {
      if (dep === legacyId) continue;
      const id = workIds.story.get(dep);
      if (id) {
        dependsOn.push(id);
        legacyDependsOn.push(dep);
        if (storyValues.get(dep) === null) plan.notes.push(`${legacyId}: its dependency ${dep} is held back by a conflict; the link resolves once ${dep} is imported`);
      } else plan.notes.push(`${legacyId}: dependency ${dep} was not found in the v4 backlog; dropped`);
    }
    if (epic && isOpen(status)) openByEpic.set(epic, [...(openByEpic.get(epic) ?? []), legacyId]);
    const id = workIds.story.get(legacyId)!;
    const priority = mapV4Priority(values.priority);
    remap('story', 'priority', values.priority, priority, legacyId);
    const data: Record<string, unknown> = { schema: 1, type: 'story', id, title, status };
    if (priority) data.priority = priority;
    if (epic) data.epic = epic;
    data.depends_on = dependsOn;
    data.legacy_id = legacyId;
    data.legacy_source = r.sources;
    const file = path.join(artifactDir(scan.paths, 'story'), artifactFileName(id, title));
    plan.stories.push({
      type: 'story',
      legacyId,
      id,
      title,
      status,
      legacyStatus: values.status ?? null,
      ...(priority ? { priority } : {}),
      legacyPriority: values.priority ?? null,
      ...(epic ? { epic, legacyEpic: values.epic } : {}),
      dependsOn,
      legacyDependsOn,
      path: relToProject(scan.paths, file),
      sources: r.sources,
      content: serialize(data, body('story', title, r, status === 'done')),
    });
  }
  // Open stories that were imported earlier also keep their epic open.
  for (const s of scan.stories) {
    if (s.epic && isOpen(s.status)) openByEpic.set(s.epic, [...(openByEpic.get(s.epic) ?? []), s.legacy_id ?? s.id]);
  }

  for (const legacyId of sortIds(backlog.epics.keys())) {
    if (claimed.has(legacyId)) continue;
    const r = backlog.epics.get(legacyId)!;
    const values = epicValues.get(legacyId);
    if (!values) continue;
    const title = oneLine(values.title ?? '') || legacyId;
    const mapped = mapV4EpicStatus(values.status);
    let status = mapped.status;
    if (!mapped.known) plan.notes.push(`${legacyId}: unknown v4 status "${oneLine(values.status!)}"; imported as proposed`);
    const id = workIds.epic.get(legacyId)!;
    const open = openByEpic.get(id) ?? [];
    if (status === 'done' && open.length) {
      status = 'active';
      plan.notes.push(`${legacyId} is ${oneLine(values.status!)} in v4 but has ${open.length} open stor${open.length === 1 ? 'y' : 'ies'} (${open.slice(0, 5).join(', ')}${open.length > 5 ? ', ...' : ''}); imported as active`);
    } else if (mapped.known) remap('epic', 'status', values.status, status, legacyId);
    const priority = mapV4Priority(values.priority);
    remap('epic', 'priority', values.priority, priority, legacyId);
    const data: Record<string, unknown> = { schema: 1, type: 'epic', id, title, status };
    if (priority) data.priority = priority;
    data.legacy_id = legacyId;
    data.legacy_source = r.sources;
    const file = path.join(artifactDir(scan.paths, 'epic'), artifactFileName(id, title));
    plan.epics.push({
      type: 'epic',
      legacyId,
      id,
      title,
      status,
      legacyStatus: values.status ?? null,
      ...(priority ? { priority } : {}),
      legacyPriority: values.priority ?? null,
      path: relToProject(scan.paths, file),
      sources: r.sources,
      content: serialize(data, body('epic', title, r, status === 'done')),
    });
  }

  plan.remaps = [...remaps.values()];
  if (strippedStatusLines) {
    plan.notes.push(
      `removed ${strippedStatusLines} v4 \`**Status**:\` line${strippedStatusLines === 1 ? '' : 's'} from imported bodies; the frontmatter status is authoritative (the v4 files keep theirs)`,
    );
  }

  // Cycles that involve an item imported now (cycles among earlier imports were reported then; `check` reports them).
  const planned = new Set(plan.stories.map((p) => p.id));
  const graph = [...scan.stories, ...plan.stories.map((p) => ({ id: p.id, depends_on: p.dependsOn }) as unknown as (typeof scan.stories)[number])];
  const legacyOf = new Map(plan.stories.map((p) => [p.id, p.legacyId]));
  for (const s of scan.stories) if (s.legacy_id) legacyOf.set(s.id, s.legacy_id);
  for (const cycle of findDependencyCycles(graph)) {
    if (!cycle.some((id) => planned.has(id))) continue;
    plan.notes.push(`dependency cycle in the v4 backlog: ${capList([...cycle, cycle[0]!].map((id) => legacyOf.get(id) ?? id))}; \`agileflow check\` will report it`);
  }
  return plan;
}

export interface V4ImportResult {
  created: string[];
}

/**
 * Write the planned files (epics first). Never overwrites: a file that already
 * exists stops the import; what was written so far stays, and running the
 * import again skips it by `legacy_id`. The v4 files are only read. Items
 * held back by conflicts are not written.
 */
export async function applyV4Import(scan: WorkScan, plan: V4ImportPlan): Promise<V4ImportResult> {
  const result: V4ImportResult = { created: [] };
  for (const item of [...plan.epics, ...plan.stories]) {
    const abs = path.join(scan.paths.projectRoot, ...item.path.split('/'));
    await fs.promises.mkdir(path.dirname(abs), { recursive: true });
    try {
      await fs.promises.writeFile(abs, item.content, { flag: 'wx' });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      throw new WorkError(`${item.path} already exists; stopped after ${result.created.length} of ${plan.epics.length + plan.stories.length} items`, [
        'Run `agileflow work import v4 --preview` again: imported items are skipped by legacy_id, and a file that is not a valid work item is reported (see `agileflow check`).',
      ]);
    }
    result.created.push(item.path);
  }
  return result;
}
