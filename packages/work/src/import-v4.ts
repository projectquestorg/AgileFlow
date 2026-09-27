import fs from 'node:fs';
import path from 'node:path';
import { OPEN_STORY_STATUSES } from './constants';
import { parse, serialize } from './frontmatter';
import { createId } from './ids';
import { artifactDir, artifactFileName, relToProject, WorkError } from './paths';
import { allArtifacts, type WorkScan } from './scanner';
import { artifactBody } from './templates';
import type { EpicStatus, Priority, StoryStatus } from './types';
import { findDependencyCycles } from './validate';

/**
 * Import a v4 AgileFlow backlog (`docs/05-epics`, `docs/06-stories`,
 * `docs/09-agents/status.json`) into Work items. Read-only on the v4 files:
 * nothing is ever deleted or changed there. Each imported item records its v4
 * ID in `legacy_id`, so running the import again skips what is already there.
 */

export const V4_EPICS_DIR = 'docs/05-epics';
export const V4_STORIES_DIR = 'docs/06-stories';
export const V4_STATUS_FILE = 'docs/09-agents/status.json';

export interface PlannedImport {
  type: 'epic' | 'story';
  /** v4 ID, e.g. `EP-0007` or `US-0042`. Written as `legacy_id`. */
  legacyId: string;
  /** New Work ID. */
  id: string;
  title: string;
  /** Work status after mapping. */
  status: EpicStatus | StoryStatus;
  /** The v4 status as written (null when v4 had none). */
  legacyStatus: string | null;
  priority?: Priority;
  /** Stories: Work ID of the epic (new or previously imported). */
  epic?: string;
  /** Stories: Work IDs of dependencies. */
  dependsOn?: string[];
  /** Target path relative to the project root. */
  path: string;
  /** v4 files the item was read from (status.json and/or a Markdown file). */
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

export interface V4ImportPlan {
  /** Any v4 backlog source exists. */
  found: boolean;
  /** v4 sources that were read, relative to the project root. */
  sources: string[];
  epics: PlannedImport[];
  stories: PlannedImport[];
  /** Already imported (a Work item has this legacy_id). */
  skipped: SkippedImport[];
  /** Things the user should know: mapped statuses, dropped references, adjustments. */
  notes: string[];
}

interface V4Record {
  legacyId: string;
  title?: string;
  status?: string;
  priority?: string;
  epic?: string;
  dependsOn: string[];
  criteria: string[];
  description?: string;
  summary?: string;
  body?: string;
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

function oneLine(title: string): string {
  // eslint-disable-next-line no-control-regex
  return title.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, ' ').replace(/\s+/g, ' ').trim();
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
    r = { legacyId, dependsOn: [], criteria: [], sources: [] };
    map.set(legacyId, r);
  }
  return r;
};

/** Read every v4 backlog source under the project root. */
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
      r.title = str(v.title) ?? r.title;
      r.status = str(v.status) ?? r.status;
      r.priority = str(v.priority) ?? r.priority;
      r.description = str(v.goal) ?? str(v.description) ?? r.description;
      r.summary = str(v.summary) ?? r.summary;
      if (!r.sources.includes(V4_STATUS_FILE)) r.sources.push(V4_STATUS_FILE);
    }
    for (const [key, v] of storyEntries) {
      const id = key.trim().toUpperCase();
      if (!STORY_ID_RE.test(id)) continue;
      const r = record(backlog.stories, id);
      r.title = str(v.title) ?? r.title;
      r.status = str(v.status) ?? r.status;
      r.priority = str(v.priority) ?? r.priority;
      r.epic = str(v.epic)?.toUpperCase() ?? r.epic;
      r.dependsOn = idList(v.depends_on, v.dependencies, v.blocked_by, v.dependsOn);
      const criteria = textList(v.acceptance_criteria).length ? textList(v.acceptance_criteria) : textList(v.ac);
      if (criteria.length) r.criteria = criteria;
      r.description = str(v.description) ?? r.description;
      r.summary = str(v.summary) ?? r.summary;
      if (!r.sources.includes(V4_STATUS_FILE)) r.sources.push(V4_STATUS_FILE);
    }
  }

  // 2. Markdown files: bodies, plus fields status.json does not have.
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
      if (r.body !== undefined) {
        backlog.notes.push(`${legacyId} has more than one file; using ${r.sources.find((s) => s.endsWith('.md'))}, ignoring ${rel(abs)}`);
        continue;
      }
      r.body = body;
      r.sources.push(rel(abs));
      r.title ??= str(fm.title) ?? headingTitle(body, legacyId);
      r.status ??= str(fm.status) ?? boldField(body, 'Status');
      r.priority ??= str(fm.priority) ?? boldField(body, 'Priority');
      if (type === 'story') {
        const parentDir = path.basename(path.dirname(abs)).toUpperCase();
        const epicLine = boldField(body, 'Epic');
        r.epic ??=
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

function generatedBody(type: 'epic' | 'story', title: string, r: V4Record, done: boolean): string {
  const sections: string[] = [];
  if (r.description) sections.push(`## ${type === 'epic' ? 'Outcome' : 'Why'}\n\n${r.description}\n`);
  if (type === 'story' && r.criteria.length) {
    sections.push(`## Acceptance Criteria\n\n${r.criteria.map((c) => `- [${done ? 'x' : ' '}] ${oneLine(c)}`).join('\n')}\n`);
  }
  if (r.summary) sections.push(`## Notes\n\n${r.summary}\n`);
  if (!sections.length) return artifactBody(type, title);
  return `# ${title}\n\n${sections.join('\n')}`;
}

/**
 * Work out what `work import v4` would create. Nothing is written. New IDs
 * are generated here; applying the same plan writes exactly these IDs.
 */
export async function planV4Import(scan: WorkScan): Promise<V4ImportPlan> {
  const { projectRoot } = scan.paths;
  const backlog = await readV4Backlog(projectRoot);
  const plan: V4ImportPlan = { found: backlog.found, sources: backlog.sources, epics: [], stories: [], skipped: [], notes: [...backlog.notes] };
  if (!backlog.found) return plan;

  const taken = new Set(allArtifacts(scan).map((a) => a.id));
  const imported = new Map<string, string>();
  for (const a of [...scan.epics, ...scan.stories]) if (a.legacy_id) imported.set(a.legacy_id.toUpperCase(), a.id);

  const epicIds = new Map<string, string>();
  const storyIds = new Map<string, string>();
  const fresh = (type: 'epic' | 'story') => {
    const id = createId(type, taken);
    taken.add(id);
    return id;
  };

  const sortIds = (ids: Iterable<string>) => [...ids].sort((a, b) => Number(a.split('-')[1]) - Number(b.split('-')[1]) || (a < b ? -1 : 1));

  for (const legacyId of sortIds(backlog.epics.keys())) {
    const existing = imported.get(legacyId);
    if (existing) {
      epicIds.set(legacyId, existing);
      plan.skipped.push({ legacyId, type: 'epic', existing });
    } else epicIds.set(legacyId, fresh('epic'));
  }
  for (const legacyId of sortIds(backlog.stories.keys())) {
    const existing = imported.get(legacyId);
    if (existing) {
      storyIds.set(legacyId, existing);
      plan.skipped.push({ legacyId, type: 'story', existing });
    } else storyIds.set(legacyId, fresh('story'));
  }

  // Stories first: epics that would be done with open stories are imported as active.
  const openByEpic = new Map<string, string[]>();
  for (const legacyId of sortIds(backlog.stories.keys())) {
    if (imported.has(legacyId)) continue;
    const r = backlog.stories.get(legacyId)!;
    const title = oneLine(r.title ?? '') || legacyId;
    const { status, known } = mapV4StoryStatus(r.status);
    if (!known) plan.notes.push(`${legacyId}: unknown v4 status "${r.status}"; imported as backlog`);
    let epic: string | undefined;
    if (r.epic) {
      epic = epicIds.get(r.epic);
      if (!epic) plan.notes.push(`${legacyId}: epic ${r.epic} was not found in the v4 backlog; imported as a standalone story`);
    }
    const dependsOn: string[] = [];
    for (const dep of r.dependsOn) {
      if (dep === legacyId) continue;
      const id = storyIds.get(dep);
      if (id) dependsOn.push(id);
      else plan.notes.push(`${legacyId}: dependency ${dep} was not found in the v4 backlog; dropped`);
    }
    if (epic && (OPEN_STORY_STATUSES as readonly string[]).includes(status)) {
      const list = openByEpic.get(epic) ?? [];
      list.push(legacyId);
      openByEpic.set(epic, list);
    }
    const id = storyIds.get(legacyId)!;
    const priority = mapV4Priority(r.priority);
    const data: Record<string, unknown> = { schema: 1, type: 'story', id, title, status };
    if (priority) data.priority = priority;
    if (epic) data.epic = epic;
    data.depends_on = dependsOn;
    data.legacy_id = legacyId;
    const body = r.body ?? generatedBody('story', title, r, status === 'done');
    const file = path.join(artifactDir(scan.paths, 'story'), artifactFileName(id, title));
    plan.stories.push({
      type: 'story',
      legacyId,
      id,
      title,
      status,
      legacyStatus: r.status ?? null,
      ...(priority ? { priority } : {}),
      ...(epic ? { epic } : {}),
      dependsOn,
      path: relToProject(scan.paths, file),
      sources: r.sources,
      content: serialize(data, body),
    });
  }
  // Open stories that were imported earlier also keep their epic open.
  for (const s of scan.stories) {
    if (s.epic && (OPEN_STORY_STATUSES as readonly string[]).includes(s.status)) {
      const list = openByEpic.get(s.epic) ?? [];
      list.push(s.legacy_id ?? s.id);
      openByEpic.set(s.epic, list);
    }
  }

  for (const legacyId of sortIds(backlog.epics.keys())) {
    if (imported.has(legacyId)) continue;
    const r = backlog.epics.get(legacyId)!;
    const title = oneLine(r.title ?? '') || legacyId;
    const mapped = mapV4EpicStatus(r.status);
    let status = mapped.status;
    if (!mapped.known) plan.notes.push(`${legacyId}: unknown v4 status "${r.status}"; imported as proposed`);
    const id = epicIds.get(legacyId)!;
    const open = openByEpic.get(id) ?? [];
    if (status === 'done' && open.length) {
      status = 'active';
      plan.notes.push(`${legacyId} is ${r.status} in v4 but has ${open.length} open stor${open.length === 1 ? 'y' : 'ies'} (${open.slice(0, 5).join(', ')}${open.length > 5 ? ', ...' : ''}); imported as active`);
    }
    const priority = mapV4Priority(r.priority);
    const data: Record<string, unknown> = { schema: 1, type: 'epic', id, title, status };
    if (priority) data.priority = priority;
    data.legacy_id = legacyId;
    const body = r.body ?? generatedBody('epic', title, r, status === 'done');
    const file = path.join(artifactDir(scan.paths, 'epic'), artifactFileName(id, title));
    plan.epics.push({
      type: 'epic',
      legacyId,
      id,
      title,
      status,
      legacyStatus: r.status ?? null,
      ...(priority ? { priority } : {}),
      path: relToProject(scan.paths, file),
      sources: r.sources,
      content: serialize(data, body),
    });
  }

  const graph = [
    ...scan.stories,
    ...plan.stories.map((p) => ({ id: p.id, depends_on: p.dependsOn }) as unknown as (typeof scan.stories)[number]),
  ];
  const legacyOf = new Map(plan.stories.map((p) => [p.id, p.legacyId]));
  for (const cycle of findDependencyCycles(graph)) {
    plan.notes.push(`dependency cycle in the v4 backlog: ${[...cycle, cycle[0]!].map((id) => legacyOf.get(id) ?? id).join(' -> ')}; \`agileflow check\` will report it`);
  }
  return plan;
}

export interface V4ImportResult {
  created: string[];
}

/**
 * Write the planned files (epics first). Never overwrites: a file that already
 * exists stops the import; what was written so far stays, and running the
 * import again skips it by `legacy_id`.
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
        'Run the import again: items already imported are skipped by legacy_id.',
      ]);
    }
    result.created.push(item.path);
  }
  return result;
}
