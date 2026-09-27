import {
  commitAdd,
  editScopeConfig,
  findProjectRoot,
  globalScope,
  loadWorkspace,
  packMembers,
  pathExists,
  prepareAdd,
  projectScope,
  readGlobalConfig,
  readProjectConfig,
  saveLock,
  type AddRequest,
  type Diagnostic,
  type ScopeTarget,
  type Services,
} from '@agileflow/core';
import {
  acceptanceCriteria,
  ARTIFACT_TYPES,
  buildBoard,
  decisionsFor,
  DEFAULT_WORK_ROOT,
  dependenciesForStory,
  dependentsOfStory,
  epicProgress,
  getArtifact,
  artifactsWithId,
  initWorkspace,
  inspectWorkspace,
  isValidStatus,
  listDecisions,
  listEpics,
  listStories,
  resolvePartialId,
  resolveWorkPaths,
  scanWorkspace,
  setStatus,
  statusesFor,
  STORY_STATUSES,
  storiesForEpic,
  validateWorkspace,
  createArtifact,
  findIgnoredWorkPaths,
  planV4Import,
  applyV4Import,
  readyToStart,
  storyReadiness,
  WorkError,
  type Artifact,
  type ArtifactType,
  type Decision,
  type Epic,
  type Story,
  type WorkPaths,
  type WorkScan,
} from '@agileflow/work';
import type { Cli } from '../runtime';
import { EXIT, projectScopeForCreate, servicesFor, splitList, UsageError } from '../runtime';
import type { Output } from '../ui/output';
import { table } from '../ui/tables';

/** The Agile workflow skills (the `@agileflow/agile` pack). */
export const AGILE_SKILLS = ['creating-epics', 'writing-stories', 'working-story', 'reviewing-story', 'recording-decisions'];

interface LoadedWork {
  scope: ScopeTarget;
  paths: WorkPaths;
  scan: WorkScan;
}

/** Work settings for a project, or null when Work is not enabled there. */
export async function workSettings(scope: ScopeTarget): Promise<{ enabled: boolean; root: string } | null> {
  if (scope.kind !== 'project') return null;
  // An invalid agileflow.yaml is reported by the configuration checks; Work stays quiet.
  const config = await readProjectConfig(scope.configPath).catch(() => null);
  if (!config?.work?.enabled) return null;
  return { enabled: true, root: config.work.root ?? DEFAULT_WORK_ROOT };
}

async function loadWork(cli: Cli): Promise<LoadedWork> {
  const root = await findProjectRoot(cli.ctx.cwd, { homeDir: cli.ctx.homeDir });
  const scope = root ? projectScope(root) : null;
  const settings = scope ? await workSettings(scope) : null;
  if (!scope || !settings) {
    throw new UsageError('AgileFlow Work is not enabled in this project', [
      'Run `agileflow work init` to set up the Agile workspace (docs/agile by default).',
    ]);
  }
  const paths = resolveWorkPaths(scope.root, settings.root);
  const scan = await scanWorkspace(paths);
  if (!scan.exists) {
    throw new UsageError(`Work is enabled but ${paths.root}/ does not exist`, ['Run `agileflow work init` to create it.']);
  }
  return { scope, paths, scan };
}

const upper = (s: string) => s.replace(/-/g, ' ').toUpperCase();
const pad = (s: string, n: number) => (s.length >= n ? s : s + ' '.repeat(n - s.length));

// ---------------------------------------------------------------------------
// Output safety and the --json error contract
// ---------------------------------------------------------------------------

/**
 * Titles and bodies come from files anyone can edit. Replace control
 * characters (ANSI escapes, carriage returns, line breaks inside a field) so
 * they cannot rewrite or hide terminal output. Tabs are kept. JSON output is
 * escaped by JSON.stringify and needs no cleaning.
 */
// eslint-disable-next-line no-control-regex
const clean = (s: string) => s.replace(/[\u0000-\u0008\u000a-\u001f\u007f-\u009f\u2028\u2029]/g, '?');

/** Human-readable output with every line cleaned. */
function textOut(out: Output) {
  return {
    line: (text = '') => out.line(clean(text)),
    lines: (lines: string[]) => {
      for (const l of lines) out.line(clean(l));
    },
    heading: (text: string) => out.heading(clean(text)),
    warn: (text: string) => out.warn(clean(text)),
  };
}

function errorHints(err: unknown): string[] {
  const e = err as { hints?: unknown; hint?: unknown; file?: unknown };
  if (Array.isArray(e.hints)) return e.hints.map(String);
  if (Array.isArray(e.hint)) return e.hint.map(String);
  if (typeof e.file === 'string') return [`File: ${e.file}`];
  return [];
}

/**
 * Run a work subcommand. With --json, every error is printed as JSON on stdout
 * (`{"ok":false,"error":{"message":"...","hints":[...]}}`) and the exit code
 * is 1. Without --json, Work errors become UsageErrors for the CLI's handler.
 */
async function guarded(cli: Cli, json: boolean | undefined, fn: () => Promise<number>): Promise<number> {
  try {
    return await fn();
  } catch (err) {
    if ((err as Error)?.name === 'CancelledError') throw err;
    if (json) {
      cli.out.json({ ok: false, error: { message: (err as Error)?.message ?? String(err), hints: errorHints(err) } });
      return EXIT.ERROR;
    }
    if (err instanceof WorkError) throw new UsageError(err.message, err.hints);
    throw err;
  }
}

/**
 * The stable JSON shape of one item (`work list --json`, the base of
 * `work show --json`). Stories include derived readiness for orchestrators:
 * `dependenciesDone`, `waitingOn` (unfinished dependency IDs), and `ready`
 * (not started and every dependency done).
 */
function summary(scan: WorkScan, a: Artifact): Record<string, unknown> {
  const base: Record<string, unknown> = { id: a.id, type: a.type, title: a.title, status: a.status, path: a.path };
  if (a.type === 'epic') {
    if (a.priority) base.priority = a.priority;
    if (a.horizon) base.horizon = a.horizon;
  } else if (a.type === 'story') {
    if (a.priority) base.priority = a.priority;
    if (a.epic) base.epic = a.epic;
    base.depends_on = a.depends_on ?? [];
    const c = acceptanceCriteria(a.body);
    base.acceptanceCriteria = { total: c.total, checked: c.checked };
    Object.assign(base, storyReadiness(scan, a));
  } else {
    base.related = a.related ?? [];
  }
  if (a.type !== 'decision' && a.legacy_id) base.legacy_id = a.legacy_id;
  return base;
}

// ---------------------------------------------------------------------------
// work init
// ---------------------------------------------------------------------------

export interface WorkInitOptions {
  root?: string;
  yes?: boolean;
  /** `--no-skills` sets this to false. */
  skills?: boolean;
  json?: boolean;
}

async function agileRequests(services: Services): Promise<AddRequest[]> {
  try {
    const pack = await services.fetcher.getPack('agile');
    if (pack) return packMembers(pack).map((m) => ({ id: m.id, spec: { source: m.source, ...(m.range ? { version: m.range } : {}) } }));
  } catch {
    // fall back to the built-in list below
  }
  return AGILE_SKILLS.map((id) => ({ id, spec: { source: `@agileflow/${id}`, version: '^1' } }));
}

/** `agileflow work init`: configure Work, create the workspace, and (optionally) add the Agile skills. */
export async function runWorkInit(cli: Cli, options: WorkInitOptions): Promise<number> {
  return guarded(cli, options.json, () => workInit(cli, options));
}

async function workInit(cli: Cli, options: WorkInitOptions): Promise<number> {
  const { ctx, prompter } = cli;
  const out = textOut(cli.out);
  const scope = await projectScopeForCreate(ctx);
  const config = (await pathExists(scope.configPath)) ? await readProjectConfig(scope.configPath) : null;
  const current = config?.work?.enabled ? (config.work.root ?? DEFAULT_WORK_ROOT) : null;
  if (current && options.root && resolveWorkPaths(scope.root, options.root).root !== resolveWorkPaths(scope.root, current).root) {
    throw new UsageError(`Work is already enabled with root ${current}`, [
      'Move the directory and change work.root in agileflow.yaml if you want a different location.',
    ]);
  }
  const paths = resolveWorkPaths(scope.root, options.root ?? current ?? DEFAULT_WORK_ROOT);
  const inspection = await inspectWorkspace(paths);

  // Adoption gate. For an already-enabled workspace, init only recreates
  // missing starter files (never overwrites); `check` reports anything else.
  const blocked = current ? inspection.conflicts.filter((c) => / is not a directory$| is a directory$/.test(c)) : inspection.conflicts;
  if (inspection.exists && blocked.length) {
    throw new UsageError(`${paths.root}/ already exists and does not match the AgileFlow Work layout`, [
      ...blocked,
      'Nothing was changed. Move or rename those entries (or pick another location with --root), then run `agileflow work init` again.',
    ]);
  }

  if (!options.json) {
    out.line('AgileFlow Work organizes durable product work using:');
    out.lines(['  product', '  roadmap', '  epics', '  stories', '  decisions']);
    out.line('Workspace:');
    out.line(`  ${paths.root}`);
  }

  // Work files are shared through Git. Warn (never refuse) when the root is ignored.
  const warnings: string[] = [];
  const ignored = await findIgnoredWorkPaths(paths);
  if (ignored?.length) {
    const rule = ignored[0]!;
    const top = paths.root.split('/')[0]!;
    const dirRule = top !== paths.root && rule.pattern.replace(/^\//, '').replace(/\/$/, '') === top;
    warnings.push(
      `${paths.root}/ is ignored by Git (${rule.source}: ${rule.pattern}), so epics and stories would not be committed or shared. ` +
        `Pick another --root, or change ${rule.source.replace(/:\d+$/, '')} so it no longer matches` +
        (dirRule ? ` (a directory rule like \`${rule.pattern}\` cannot be re-included; use \`/${top}/*\` plus \`!/${paths.root}/\`).` : '.'),
    );
  }
  if (!options.json) for (const w of warnings) out.warn(w);

  const adopting = inspection.exists && !current;
  if (adopting) {
    const c = inspection.counts;
    const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
    const what = `${paths.root}/ already exists (${n(c.epics, 'epic', 'epics')}, ${n(c.stories, 'story', 'stories')}, ${n(c.decisions, 'decision', 'decisions')}) and is compatible.`;
    if (!options.yes && !prompter.interactive) {
      throw new UsageError(clean(what), ['Rerun with --yes to adopt it. Existing files are never overwritten.']);
    }
    if (!options.yes) {
      if (!options.json) out.line(what);
      const ok = await prompter.confirm(`Adopt ${paths.root}/ as the AgileFlow Work workspace? Existing files are kept as they are.`, true);
      if (!ok) {
        out.line('Nothing was changed.');
        return EXIT.OK;
      }
    }
  }

  // Skills: the Agile pack, unless declined. Resolve before writing anything.
  const services = await servicesFor(ctx, scope);
  let requests: AddRequest[] = [];
  if (options.skills !== false) {
    const available = await agileRequests(services);
    const installed = (await pathExists(scope.configPath)) ? (await loadWorkspace(scope)).specs : {};
    const candidates = available.filter((r) => !installed[r.id]);
    if (candidates.length && prompter.interactive && !options.yes) {
      const picked = await prompter.multiselect(
        'Install Agile workflow skills?',
        candidates.map((r) => ({ value: r.id, label: r.id })),
        candidates.map((r) => r.id),
        false,
      );
      requests = candidates.filter((r) => picked.includes(r.id));
    } else {
      requests = candidates;
    }
    if (requests.length) await prepareAdd(services, await loadWorkspace(scope), requests);
  }
  if (prompter.interactive && !options.yes && !(await prompter.confirm('Continue?', true))) {
    out.line('Nothing was changed.');
    return EXIT.OK;
  }

  // 1. configure Work
  const personal = await readGlobalConfig(globalScope(ctx).configPath).catch(() => null);
  await editScopeConfig(
    scope,
    (doc) => {
      doc.setIn(['work', 'enabled'], true);
      doc.setIn(['work', 'root'], paths.root);
    },
    { questionPreference: personal?.defaults?.questionPreference ?? 'provider-default' },
  );
  // 2. create the workspace (never overwrites)
  const created = await initWorkspace(paths);
  // 3. add the Agile skills
  let installedSkills: string[] = [];
  const ws = await loadWorkspace(scope);
  if (requests.length) {
    const prepared = await prepareAdd(services, ws, requests);
    await commitAdd(services, ws, prepared);
    installedSkills = prepared.map((p) => `${p.id}@${p.pkg.version}`);
  } else if (!ws.lockExists) {
    // A project created by `work init` alone still gets its (empty) lockfile.
    await saveLock(ws);
  }

  if (options.json) {
    cli.out.json({ root: paths.root, adopted: adopting, created: created.created, kept: created.kept, skills: installedSkills, warnings });
    return EXIT.OK;
  }
  out.line();
  if (created.created.length) out.lines(['Created:', ...created.created.map((f) => `  ${f}`)]);
  if (created.kept.length) out.lines(['Kept (unchanged):', ...created.kept.map((f) => `  ${f}`)]);
  if (installedSkills.length) out.line(`Installed ${installedSkills.join(', ')}`);
  else if (options.skills === false) out.line('Agile skills not installed; the workspace and `agileflow work` commands work without them.');
  out.line(`Work is enabled in agileflow.yaml (work.root: ${paths.root}).`);
  out.line();
  out.line('Next:');
  out.line('  agileflow work new epic --title "..."');
  out.line('  agileflow work new story --title "..." [--epic <id>]');
  out.line('  agileflow work board');
  return EXIT.OK;
}

// ---------------------------------------------------------------------------
// work new
// ---------------------------------------------------------------------------

export interface WorkNewOptions {
  title?: string;
  epic?: string;
  priority?: string;
  horizon?: string;
  status?: string;
  dependsOn?: string[];
  related?: string[];
  json?: boolean;
}

export async function runWorkNew(cli: Cli, type: string, options: WorkNewOptions): Promise<number> {
  return guarded(cli, options.json, async () => {
    if (!(ARTIFACT_TYPES as readonly string[]).includes(type)) {
      throw new UsageError(`Unknown work type "${type}"`, ['Use: agileflow work new epic|story|decision --title "..."']);
    }
    if (!options.title?.trim()) throw new UsageError('--title is required', [`agileflow work new ${type} --title "..."`]);
    const { scan } = await loadWork(cli);
    const created = await createArtifact(scan, {
      type: type as ArtifactType,
      title: options.title,
      status: options.status,
      priority: options.priority,
      horizon: options.horizon,
      epic: options.epic,
      dependsOn: options.dependsOn?.flatMap(splitList),
      related: options.related?.flatMap(splitList),
    });
    if (options.json) {
      cli.out.json({ id: created.id, type: created.type, path: created.path });
    } else {
      const out = textOut(cli.out);
      out.line(`Created ${created.id}`);
      out.line(created.path);
    }
    return EXIT.OK;
  });
}

// ---------------------------------------------------------------------------
// work list
// ---------------------------------------------------------------------------

export interface WorkListOptions {
  type?: string;
  status?: string;
  epic?: string;
  /** Only stories that can be started now (ready/backlog, every dependency done). */
  ready?: boolean;
  json?: boolean;
}

const TYPE_NAMES: Record<string, ArtifactType> = {
  epic: 'epic',
  epics: 'epic',
  story: 'story',
  stories: 'story',
  decision: 'decision',
  decisions: 'decision',
};

export async function runWorkList(cli: Cli, options: WorkListOptions): Promise<number> {
  return guarded(cli, options.json, async () => {
    const { scan } = await loadWork(cli);
    let types: ArtifactType[] = [...ARTIFACT_TYPES];
    if (options.type) {
      const t = TYPE_NAMES[options.type.trim().toLowerCase()];
      if (!t) throw new UsageError(`--type must be epic, story, or decision (got "${options.type}")`);
      types = [t];
    }
    let epicId: string | undefined;
    if (options.epic) {
      epicId = resolvePartialId(options.epic, scan.epics.map((e) => e.id), 'epic');
      types = types.filter((t) => t === 'story');
      if (!types.length) throw new UsageError('--epic lists stories; drop --type or use --type story');
    }
    if (options.ready) {
      types = types.filter((t) => t === 'story');
      if (!types.length) throw new UsageError('--ready lists stories; drop --type or use --type story');
    }
    const status = options.status?.trim().toLowerCase();
    if (status && !types.some((t) => isValidStatus(t, status))) {
      throw new UsageError(`"${options.status}" is not a status of ${types.join('/')}`, types.map((t) => `${t}: ${statusesFor(t).join(', ')}`));
    }
    const epics = types.includes('epic') ? listEpics(scan).filter((e) => !status || e.status === status) : [];
    const stories = !types.includes('story')
      ? []
      : (options.ready ? readyToStart(scan, { epic: epicId }) : listStories(scan, { epic: epicId })).filter((s) => !status || s.status === status);
    const decisions = types.includes('decision') ? listDecisions(scan).filter((d) => !status || d.status === status) : [];

    if (options.json) {
      cli.out.json([...epics, ...stories, ...decisions].map((a) => summary(scan, a)));
      return EXIT.OK;
    }
    const out = textOut(cli.out);
    if (!epics.length && !stories.length && !decisions.length) {
      if (options.ready) out.line('No stories can be started now (none are ready or backlog with every dependency done).');
      else out.line(status || epicId ? 'No matching work items.' : 'No work items yet. Create one with `agileflow work new epic|story|decision --title "..."`.');
      return EXIT.OK;
    }
    const sections: string[][] = [];
    if (epics.length) {
      const lines: string[] = ['Epics'];
      for (const horizon of ['now', 'next', 'later', undefined] as const) {
        const group = epics.filter((e) => e.horizon === horizon);
        if (!group.length) continue;
        lines.push(horizon ? upper(horizon) : 'NO HORIZON');
        lines.push(
          ...table(
            ['ID', 'STATUS', 'PRIORITY', 'STORIES', 'TITLE'],
            group.map((e) => {
              const p = epicProgress(scan, e.id);
              return [e.id, e.status, e.priority ?? '-', `${p.done}/${p.total} done`, clean(e.title)];
            }),
          ).map((l) => `  ${l}`),
        );
      }
      sections.push(lines);
    }
    if (stories.length) {
      const heading = options.ready ? 'Ready to start' : 'Stories';
      sections.push([
        epicId ? `${heading} in ${epicId}` : heading,
        ...table(
          ['ID', 'STATUS', 'PRIORITY', 'EPIC', 'CRITERIA', 'TITLE'],
          stories.map((s) => {
            const c = acceptanceCriteria(s.body);
            return [s.id, s.status, s.priority ?? '-', s.epic ?? '-', c.total ? `${c.checked}/${c.total}` : '-', clean(s.title)];
          }),
        ).map((l) => `  ${l}`),
      ]);
    }
    if (decisions.length) {
      sections.push([
        'Decisions',
        ...table(['ID', 'STATUS', 'TITLE'], decisions.map((d) => [d.id, d.status, clean(d.title)])).map((l) => `  ${l}`),
      ]);
    }
    sections.forEach((lines, i) => {
      if (i) out.line();
      out.lines(lines);
    });
    return EXIT.OK;
  });
}

// ---------------------------------------------------------------------------
// work show
// ---------------------------------------------------------------------------

export interface WorkShowOptions {
  json?: boolean;
  body?: boolean;
}

const find = (scan: WorkScan, id: string) => artifactsWithId(scan, id)[0];

export async function runWorkShow(cli: Cli, id: string, options: WorkShowOptions): Promise<number> {
  return guarded(cli, options.json, async () => {
    const { scan } = await loadWork(cli);
    const artifact = getArtifact(scan, id);

    if (options.json) {
      const data: Record<string, unknown> = { ...summary(scan, artifact), body: artifact.body };
      if (artifact.type === 'story') {
        data.dependencies = dependenciesForStory(scan, artifact).map((d) => ({ id: d.id, title: d.story?.title ?? null, status: d.story?.status ?? null }));
        data.dependents = dependentsOfStory(scan, artifact.id).map((s) => ({ id: s.id, title: s.title, status: s.status }));
        data.acceptanceCriteria = acceptanceCriteria(artifact.body);
        data.decisions = relatedDecisions(scan, artifact).map((d) => ({ id: d.id, title: d.title, status: d.status }));
      } else if (artifact.type === 'epic') {
        data.stories = storiesForEpic(scan, artifact.id).map((s) => ({ id: s.id, title: s.title, status: s.status, priority: s.priority ?? null, ...storyReadiness(scan, s) }));
        data.progress = epicProgress(scan, artifact.id);
        data.decisions = decisionsFor(scan, artifact.id).map((d) => ({ id: d.id, title: d.title, status: d.status }));
      } else {
        data.related = (artifact.related ?? []).map((rid) => {
          const a = find(scan, rid);
          return { id: rid, type: a?.type ?? null, title: a?.title ?? null, status: a?.status ?? null };
        });
      }
      cli.out.json(data);
      return EXIT.OK;
    }

    const out = textOut(cli.out);
    out.line(artifact.id);
    out.line(artifact.title);
    if (artifact.type === 'story') showStory(out, scan, artifact);
    else if (artifact.type === 'epic') showEpic(out, scan, artifact);
    else showDecision(out, scan, artifact);
    out.line(`Path:      ${artifact.path}`);
    if (options.body) {
      out.line();
      out.lines(artifact.body.replace(/^(\r?\n)+/, '').replace(/\s+$/, '').split(/\r?\n/));
    }
    return EXIT.OK;
  });
}

type TextOut = ReturnType<typeof textOut>;

function relatedDecisions(scan: WorkScan, story: Story): Decision[] {
  const ids = new Set([story.id, ...(story.epic ? [story.epic] : [])]);
  const mentioned = new Set(story.body.match(/\bDEC-[0-9A-Z]{8}\b/g) ?? []);
  return scan.decisions.filter((d) => mentioned.has(d.id) || d.related?.some((r) => ids.has(r)));
}

function showStory(out: TextOut, scan: WorkScan, story: Story): void {
  const epic = story.epic ? find(scan, story.epic) : undefined;
  out.line(`Status:    ${story.status}`);
  out.line(`Priority:  ${story.priority ?? '-'}`);
  out.line(`Epic:      ${story.epic ? `${story.epic}${epic ? `  ${epic.title}` : '  (unknown epic)'}` : 'none (standalone)'}`);
  out.line('Dependencies:');
  const deps = dependenciesForStory(scan, story);
  if (!deps.length) out.line('  none');
  for (const d of deps) out.line(`  ${d.id}  ${d.story ? `${d.story.title}  (${d.story.status})` : '(unknown story)'}`);
  if (deps.length && (story.status === 'backlog' || story.status === 'ready')) {
    const readiness = storyReadiness(scan, story);
    out.line(readiness.ready ? 'Can start: yes (every dependency is done)' : `Can start: no, waiting on ${readiness.waitingOn.join(', ')}`);
  }
  const dependents = dependentsOfStory(scan, story.id);
  if (dependents.length) {
    out.line('Needed by:');
    for (const s of dependents) out.line(`  ${s.id}  ${s.title}  (${s.status})`);
  }
  const decisions = relatedDecisions(scan, story);
  if (decisions.length) {
    out.line('Decisions:');
    for (const d of decisions) out.line(`  ${d.id}  ${d.title}  (${d.status})`);
  }
  const c = acceptanceCriteria(story.body);
  out.line('Acceptance Criteria:');
  out.line(c.total ? `  ${c.checked} / ${c.total} complete` : '  none written yet');
}

function showEpic(out: TextOut, scan: WorkScan, epic: Epic): void {
  out.line(`Status:    ${epic.status}`);
  out.line(`Priority:  ${epic.priority ?? '-'}`);
  out.line(`Horizon:   ${epic.horizon ?? '-'}`);
  const stories = storiesForEpic(scan, epic.id);
  out.line('Stories');
  if (!stories.length) out.line('  none yet');
  const width = Math.max(0, ...stories.map((s) => s.id.length));
  for (const status of STORY_STATUSES) {
    const group = stories.filter((s) => s.status === status);
    if (!group.length) continue;
    out.line(upper(status));
    for (const s of group) out.line(`  ${pad(s.id, width)}  ${s.title}${s.priority ? `  ${s.priority}` : ''}`);
  }
  const decisions = decisionsFor(scan, epic.id);
  if (decisions.length) {
    out.line('Decisions');
    for (const d of decisions) out.line(`  ${d.id}  ${d.title}  (${d.status})`);
  }
  const p = epicProgress(scan, epic.id);
  out.line('Progress');
  out.line(`  ${p.done} / ${p.total - p.cancelled} stories done${p.cancelled ? ` (${p.cancelled} cancelled)` : ''}`);
}

function showDecision(out: TextOut, scan: WorkScan, decision: Decision): void {
  out.line(`Status:    ${decision.status}`);
  out.line('Related:');
  if (!decision.related?.length) out.line('  none');
  for (const rid of decision.related ?? []) {
    const a = find(scan, rid);
    out.line(`  ${rid}  ${a ? `${a.title}  (${a.status})` : '(unknown)'}`);
  }
}

// ---------------------------------------------------------------------------
// work status
// ---------------------------------------------------------------------------

export interface WorkStatusOptions {
  json?: boolean;
  force?: boolean;
}

export async function runWorkStatus(cli: Cli, id: string, status: string, options: WorkStatusOptions): Promise<number> {
  return guarded(cli, options.json, async () => {
    const { scan } = await loadWork(cli);
    const artifact = getArtifact(scan, id);
    const change = await setStatus(scan, artifact, status, { force: options.force });
    if (options.json) {
      cli.out.json(change);
      return EXIT.OK;
    }
    const out = textOut(cli.out);
    out.line(change.id);
    out.line(change.changed ? `${change.from} -> ${change.to}` : `already ${change.to}`);
    for (const w of change.warnings) out.warn(w);
    return EXIT.OK;
  });
}

// ---------------------------------------------------------------------------
// work board
// ---------------------------------------------------------------------------

export async function runWorkBoard(cli: Cli, options: { json?: boolean }): Promise<number> {
  return guarded(cli, options.json, async () => {
    const { scan } = await loadWork(cli);
    const board = buildBoard(scan);
    const brief = (s: Story) => ({
      id: s.id,
      title: s.title,
      status: s.status,
      priority: s.priority ?? null,
      epic: s.epic ?? null,
      path: s.path,
      depends_on: s.depends_on ?? [],
      ...storyReadiness(scan, s),
    });

    if (options.json) {
      cli.out.json({
        groups: board.groups.map((g) => ({
          horizon: g.horizon,
          epics: g.epics.map((e) => ({
            id: e.epic.id,
            title: e.epic.title,
            status: e.epic.status,
            priority: e.epic.priority ?? null,
            path: e.epic.path,
            progress: e.progress,
            columns: e.columns.map((c) => ({ status: c.status, stories: c.stories.map(brief) })),
          })),
        })),
        standalone: board.standalone.map((c) => ({ status: c.status, stories: c.stories.map(brief) })),
        readyToStart: readyToStart(scan).map((s) => s.id),
        warnings: board.warnings.map((w) => ({
          story: w.story.id,
          dependsOn: w.dependency.id,
          dependencyStatus: w.dependency.story?.status ?? null,
        })),
      });
      return EXIT.OK;
    }

    const out = textOut(cli.out);
    const allStories = [...board.groups.flatMap((g) => g.epics.flatMap((e) => e.columns.flatMap((c) => c.stories))), ...board.standalone.flatMap((c) => c.stories)];
    let longest = 24;
    for (const s of allStories) longest = Math.max(longest, s.title.length);
    for (const g of board.groups) for (const e of g.epics) longest = Math.max(longest, e.epic.title.length);
    const titleWidth = Math.min(44, longest);
    out.heading('AGILEFLOW WORK');
    if (!board.groups.length && !board.standalone.length) {
      out.line('No open work. Create an epic or story with `agileflow work new`.');
    }
    const storyLines = (columns: typeof board.standalone, indent: string) => {
      for (const col of columns) {
        out.line(`${indent}${upper(col.status)}`);
        for (const s of col.stories) out.line(`${indent}  ${s.id}  ${pad(s.title, titleWidth)}  ${s.priority ?? ''}`.trimEnd());
      }
    };
    for (const group of board.groups) {
      out.line(group.horizon === 'unscheduled' ? 'NO HORIZON' : upper(group.horizon));
      for (const e of group.epics) {
        const done = `${e.progress.done}/${e.progress.total - e.progress.cancelled} done`;
        out.line(`${e.epic.id}  ${pad(e.epic.title, titleWidth + 2)}  ${pad(e.epic.status, 8)}  ${done}`);
        if (!e.columns.length) out.line('  (no open stories)');
        storyLines(e.columns, '  ');
      }
    }
    if (board.standalone.length) {
      out.line('STANDALONE');
      storyLines(board.standalone, '  ');
    }
    if (board.warnings.length) {
      out.line();
      for (const w of board.warnings) {
        const dep = w.dependency.story;
        out.line(`! ${w.story.id} ${w.story.title} is marked ready`);
        out.line(`  but depends on ${w.dependency.id}${dep ? ` ${dep.title} (${dep.status})` : ' (unknown story)'}`);
      }
    }
    return EXIT.OK;
  });
}

// ---------------------------------------------------------------------------
// work import v4
// ---------------------------------------------------------------------------

export interface WorkImportOptions {
  /** Show the plan only (the default without --yes when not interactive). */
  preview?: boolean;
  yes?: boolean;
  json?: boolean;
}

/**
 * `agileflow work import v4`: convert a v4 backlog into Work items. Shows the
 * plan first; writes only with --yes or after confirmation. Never changes or
 * deletes the v4 files; re-running skips items already imported (legacy_id).
 */
export async function runWorkImport(cli: Cli, from: string, options: WorkImportOptions): Promise<number> {
  return guarded(cli, options.json, async () => {
    if (from?.trim().toLowerCase() !== 'v4') throw new UsageError(`Cannot import from "${from}"`, ['Supported: agileflow work import v4']);
    const { scan, paths } = await loadWork(cli);
    const plan = await planV4Import(scan);
    if (!plan.found) {
      throw new UsageError('No v4 backlog found', [
        'Looked for docs/05-epics/, docs/06-stories/, and docs/09-agents/status.json in the project root.',
      ]);
    }
    const total = plan.epics.length + plan.stories.length;
    const apply = !options.preview && total > 0 && (options.yes || (cli.prompter.interactive && !options.json));
    const item = (p: (typeof plan.epics)[number]) => ({
      legacyId: p.legacyId,
      id: p.id,
      type: p.type,
      title: p.title,
      status: p.status,
      legacyStatus: p.legacyStatus,
      priority: p.priority ?? null,
      ...(p.type === 'story' ? { epic: p.epic ?? null, depends_on: p.dependsOn ?? [] } : {}),
      path: p.path,
      sources: p.sources,
    });

    if (!options.json) {
      const out = textOut(cli.out);
      out.line(`Import the v4 backlog into ${paths.root}/`);
      out.line(`Read: ${plan.sources.join(', ')}`);
      if (plan.epics.length) {
        out.line(`Epics (${plan.epics.length} new)`);
        out.lines(table(['V4', 'NEW ID', 'STATUS', 'TITLE'], plan.epics.map((p) => [p.legacyId, p.id, p.status, clean(p.title)])).map((l) => `  ${l}`));
      }
      if (plan.stories.length) {
        const legacyOf = new Map([...plan.epics.map((p) => [p.id, p.legacyId] as const)]);
        for (const e of scan.epics) if (e.legacy_id) legacyOf.set(e.id, e.legacy_id);
        out.line(`Stories (${plan.stories.length} new)`);
        out.lines(
          table(
            ['V4', 'NEW ID', 'STATUS', 'EPIC', 'TITLE'],
            plan.stories.map((p) => [p.legacyId, p.id, p.status, p.epic ? (legacyOf.get(p.epic) ?? p.epic) : '-', clean(p.title)]),
          ).map((l) => `  ${l}`),
        );
      }
      if (plan.skipped.length) out.line(`Already imported: ${plan.skipped.length} (skipped)`);
      for (const note of plan.notes) out.warn(note);
      if (!total) {
        out.line('Nothing to import.');
        return EXIT.OK;
      }
      if (!apply) {
        out.line();
        out.line('Nothing was written. Run `agileflow work import v4 --yes` to import (new IDs are generated then).');
        return EXIT.OK;
      }
      if (!options.yes && !(await cli.prompter.confirm(`Create ${total} work item${total === 1 ? '' : 's'} in ${paths.root}/? The v4 files are not changed.`, true))) {
        out.line('Nothing was written.');
        return EXIT.OK;
      }
    }

    const result = apply ? await applyV4Import(scan, plan) : { created: [] as string[] };
    if (options.json) {
      cli.out.json({
        applied: apply,
        root: paths.root,
        sources: plan.sources,
        epics: plan.epics.map(item),
        stories: plan.stories.map(item),
        skipped: plan.skipped,
        notes: plan.notes,
        created: result.created,
      });
      return EXIT.OK;
    }
    const out = textOut(cli.out);
    out.line();
    out.line(`Imported ${plan.epics.length} epic${plan.epics.length === 1 ? '' : 's'} and ${plan.stories.length} stor${plan.stories.length === 1 ? 'y' : 'ies'} into ${paths.root}/.`);
    out.line('The v4 files were not changed; delete or archive them when you no longer need them.');
    out.line('Next: agileflow check, agileflow work board');
    return EXIT.OK;
  });
}

// ---------------------------------------------------------------------------
// agileflow check integration
// ---------------------------------------------------------------------------

/** The "Agile Work" section of `agileflow check`, or null when Work is not enabled. */
export async function workCheckSection(scope: ScopeTarget): Promise<{ title: string; diagnostics: Diagnostic[] } | null> {
  const settings = await workSettings(scope);
  if (!settings) return null;
  const diagnostics: Diagnostic[] = [];
  let paths: WorkPaths;
  try {
    paths = resolveWorkPaths(scope.root, settings.root);
  } catch (err) {
    return { title: 'Agile Work', diagnostics: [{ level: 'error', message: (err as Error).message }] };
  }
  const result = validateWorkspace(await scanWorkspace(paths));
  const [structure, ...checks] = result.passed[0] === 'workspace structure valid' ? result.passed : [null, ...result.passed];
  if (structure) diagnostics.push({ level: 'ok', message: structure });
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  diagnostics.push({ level: 'ok', message: n(result.counts.epics, 'epic') });
  diagnostics.push({ level: 'ok', message: result.counts.stories === 1 ? '1 story' : `${result.counts.stories} stories` });
  diagnostics.push({ level: 'ok', message: n(result.counts.decisions, 'decision') });
  for (const c of checks) if (c) diagnostics.push({ level: 'ok', message: c });
  for (const issue of result.issues) diagnostics.push({ level: issue.level, message: issue.message, detail: issue.detail });
  return { title: 'Agile Work', diagnostics };
}

/** Offer Work during `agileflow init` (interactive, project scope). */
export async function offerWorkDuringInit(cli: Cli, scope: ScopeTarget): Promise<void> {
  if (scope.kind !== 'project' || !cli.prompter.interactive) return;
  const choice = await cli.prompter.select(
    'Enable AgileFlow Work?',
    [
      { value: 'no', label: 'No' },
      { value: 'yes', label: 'Yes', hint: `epics, stories, and decisions in ${DEFAULT_WORK_ROOT}/` },
    ],
    'no',
  );
  if (choice !== 'yes') return;
  cli.out.line();
  await runWorkInit(cli, {});
}
