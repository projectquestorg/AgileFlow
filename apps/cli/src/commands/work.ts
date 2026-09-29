import {
  commitAdd,
  editScopeConfig,
  findProjectRoot,
  globalScope,
  loadWorkspace,
  OperationError,
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
  capList,
  describeIgnoredWorkPaths,
  duplicateIds,
  evaluateEvidence,
  EVIDENCE_KINDS,
  findIgnoredPaths,
  getStory,
  nextStories,
  readV4Backlog,
  recordEvidence,
  type Artifact,
  type ImportPreference,
  type NextCandidate,
  type StoryEvidence,
  type ArtifactType,
  type Decision,
  type Epic,
  type Story,
  type WorkPaths,
  type WorkScan,
} from '@agileflow/work';
import type { Cli } from '../runtime';
import { EXIT, mutate, projectScopeForCreate, servicesFor, splitList, UsageError } from '../runtime';
import type { Output } from '../ui/output';
import { table } from '../ui/tables';
import { describePrepared } from './shared';

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

/**
 * Run a Work change under the project lock, like every other changing
 * command. The workspace is scanned inside the lock, so concurrent Work
 * commands see each other's writes, and the content-hash check before each
 * write cannot race another AgileFlow process.
 */
async function mutateWork<T>(cli: Cli, fn: (work: LoadedWork) => Promise<T>): Promise<T> {
  const root = await findProjectRoot(cli.ctx.cwd, { homeDir: cli.ctx.homeDir });
  const scope = root ? projectScope(root) : null;
  // Report "not enabled" without taking the lock.
  if (!scope || !(await workSettings(scope))) await loadWork(cli);
  return mutate(cli, scope!, async () => fn(await loadWork(cli)));
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
 * (`{"ok":false,"error":{"code":"...","message":"...","hints":[...]}}`) and the exit code
 * is 1. Without --json, Work errors become UsageErrors for the CLI's handler.
 */
/** The same `error.code` classification the CLI's top-level handler uses (apps/cli/src/index.ts). */
function errorCode(err: unknown): string {
  const name = (err as Error)?.name;
  if (name === 'UsageError') return 'usage';
  if (name === 'IntegrityError') return 'integrity';
  if (name === 'ConfigError') return 'config';
  if (['OperationError', 'WorkError', 'RegistryError'].includes(name)) return 'error';
  if ((err as NodeJS.ErrnoException)?.code) return 'system';
  return 'internal';
}

async function guarded(cli: Cli, json: boolean | undefined, fn: () => Promise<number>): Promise<number> {
  try {
    return await fn();
  } catch (err) {
    if ((err as Error)?.name === 'CancelledError') throw err;
    if (json) {
      cli.out.json({ ok: false, error: { code: errorCode(err), message: (err as Error)?.message ?? String(err), hints: errorHints(err) } });
      return EXIT.ERROR;
    }
    // Messages and hints can carry file names and titles: never print their control characters.
    if (err instanceof WorkError) throw new UsageError(clean(err.message), err.hints.map(clean));
    throw err;
  }
}

/**
 * Duplicate IDs are shown, never hidden or merged: a warning on stderr (also
 * with --json, where stdout stays one JSON document) naming every file.
 */
function warnDuplicates(cli: Cli, duplicates: Array<{ id: string; paths: string[] }>): void {
  for (const d of duplicates) {
    cli.out.warn(
      clean(`${d.id} is used by ${d.paths.length} files (duplicate ID): ${d.paths.join(', ')}. Commands refuse to change it until every copy but one has a new ID.`),
    );
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
  if (a.type !== 'decision' && a.legacy_source) base.legacy_source = a.legacy_source;
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

  // Work files are shared through Git. Warn (never refuse) when the root, or part of it, is ignored.
  const warnings = describeIgnoredWorkPaths(paths, (await findIgnoredWorkPaths(paths)) ?? []);
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
  let approvedExternal = new Set<string>();
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
    if (requests.length) {
      const prepared = await prepareAdd(services, await loadWorkspace(scope), requests);
      const external = prepared.filter((p) => p.external);
      // Same rule as `add`: third-party content (for example an agile pack
      // from a registry this repository chose) needs an explicit yes.
      if (external.length && !options.yes) {
        if (!prompter.interactive || options.json) {
          throw new OperationError(`Refusing to install third-party content without confirmation: ${external.map((p) => p.id).join(', ')}`, [
            'Review it with `agileflow info <source>`, then rerun with --yes, or pass --no-skills.',
          ]);
        }
        for (const item of external) describePrepared(cli, item);
        if (!(await prompter.confirm('Install the third-party skills shown above?', false))) {
          out.line('Nothing was changed.');
          return EXIT.OK;
        }
      }
      approvedExternal = new Set(external.map((p) => `${p.id}@${p.pkg.integrity}`));
    }
  }
  if (prompter.interactive && !options.yes && !(await prompter.confirm('Continue?', true))) {
    out.line('Nothing was changed.');
    return EXIT.OK;
  }

  // Everything that writes runs under the project lock (like every other
  // changing command), after recovering any write an earlier crash interrupted.
  const { created, installedSkills } = await mutate(cli, scope, async () => {
    // Another command may have enabled Work while this one was asking questions.
    const now = (await pathExists(scope.configPath)) ? await readProjectConfig(scope.configPath) : null;
    const nowRoot = now?.work?.enabled ? (now.work.root ?? DEFAULT_WORK_ROOT) : null;
    if (nowRoot && resolveWorkPaths(scope.root, nowRoot).root !== paths.root) {
      throw new UsageError(`Work was enabled with root ${nowRoot} while this command was running`, ['Nothing was changed by this command.']);
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
      const unreviewed = prepared.filter((p) => p.external && !approvedExternal.has(`${p.id}@${p.pkg.integrity}`));
      if (unreviewed.length) {
        throw new OperationError(`Third-party content changed while this command was running: ${unreviewed.map((p) => p.id).join(', ')}`, [
          'Nothing was installed. Run `agileflow work init` again to review it.',
        ]);
      }
      await commitAdd(services, ws, prepared);
      installedSkills = prepared.map((p) => `${p.id}@${p.pkg.version}`);
    } else if (!ws.lockExists) {
      // A project created by `work init` alone still gets its (empty) lockfile.
      await saveLock(ws);
    }
    return { created, installedSkills };
  });

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
    const { created, paths } = await mutateWork(cli, async ({ scan, paths }) => ({
      paths,
      created: await createArtifact(scan, {
        type: type as ArtifactType,
        title: options.title!,
        status: options.status,
        priority: options.priority,
        horizon: options.horizon,
        epic: options.epic,
        dependsOn: options.dependsOn?.flatMap(splitList),
        related: options.related?.flatMap(splitList),
      }),
    }));
    // Work files are shared through Git: warn (never refuse) when this one would be ignored.
    const ignored = (await findIgnoredPaths(paths.projectRoot, [created.path])) ?? [];
    const warnings = ignored.map(
      (i) =>
        `${created.path} is ignored by Git (${i.source}: ${i.pattern}), so it would not be committed or shared. ` +
        `Change ${i.source.replace(/:\d+$/, '')} so it no longer matches.`,
    );
    if (options.json) {
      cli.out.json({ id: created.id, type: created.type, path: created.path, warnings });
    } else {
      const out = textOut(cli.out);
      out.line(`Created ${created.id}`);
      out.line(created.path);
      for (const w of warnings) out.warn(w);
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

    const duplicates = duplicateIds(scan);
    const duplicated = new Set(duplicates.map((d) => d.id));
    warnDuplicates(cli, duplicates);
    if (options.json) {
      cli.out.json([...epics, ...stories, ...decisions].map((a) => ({ ...summary(scan, a), ...(duplicated.has(a.id) ? { duplicateId: true } : {}) })));
      return EXIT.OK;
    }
    const out = textOut(cli.out);
    const dupMark = (a: Artifact) => (duplicated.has(a.id) ? '  (duplicate ID)' : '');
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
              return [e.id, e.status, e.priority ?? '-', `${p.done}/${p.total} done`, clean(e.title) + dupMark(e)];
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
            return [s.id, s.status, s.priority ?? '-', s.epic ?? '-', c.total ? `${c.checked}/${c.total}` : '-', clean(s.title) + dupMark(s)];
          }),
        ).map((l) => `  ${l}`),
      ]);
    }
    if (decisions.length) {
      sections.push([
        'Decisions',
        ...table(['ID', 'STATUS', 'TITLE'], decisions.map((d) => [d.id, d.status, clean(d.title) + dupMark(d)])).map((l) => `  ${l}`),
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
    const { scan, paths } = await loadWork(cli);
    const artifact = getArtifact(scan, id);
    const evidence = artifact.type === 'story' ? await evaluateEvidence(paths.projectRoot, artifact.body) : null;

    if (options.json) {
      const data: Record<string, unknown> = { ...summary(scan, artifact), body: artifact.body };
      if (artifact.type === 'story') {
        data.dependencies = dependenciesForStory(scan, artifact).map((d) => ({ id: d.id, title: d.story?.title ?? null, status: d.story?.status ?? null }));
        data.dependents = dependentsOfStory(scan, artifact.id).map((s) => ({ id: s.id, title: s.title, status: s.status }));
        data.acceptanceCriteria = acceptanceCriteria(artifact.body);
        data.evidence = evidenceJson(evidence!);
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
    if (artifact.type === 'story') showStory(out, scan, artifact, evidence!);
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

function showStory(out: TextOut, scan: WorkScan, story: Story, evidence: StoryEvidence): void {
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
  out.line('Acceptance Criteria:');
  showEvidence(out, evidence);
}

function evidenceJson(e: StoryEvidence): Record<string, unknown> {
  return { counts: e.counts, criteria: e.criteria, orphans: e.orphans, problems: e.problems };
}

const short = (sha?: string) => (sha ? sha.slice(0, 8) : null);

/** Per-criterion evidence: verified / stale / not verified. A checked box alone is never shown as proof. */
function showEvidence(out: TextOut, e: StoryEvidence): void {
  if (!e.criteria.length) out.line('  none written yet');
  else {
    const checked = e.criteria.filter((c) => c.checked).length;
    const parts = [
      e.counts.verified ? `${e.counts.verified} verified` : '',
      e.counts.stale ? `${e.counts.stale} stale` : '',
      e.counts['not-verified'] ? `${e.counts['not-verified']} not verified` : '',
    ].filter(Boolean);
    out.line(`  ${checked} / ${e.criteria.length} checked; evidence: ${parts.join(', ')}`);
  }
  for (const c of e.criteria) {
    const state = c.status === 'not-verified' ? (c.checked ? 'not verified: checked, no evidence' : 'not verified') : c.status;
    out.line(`  [${c.checked ? 'x' : ' '}] ${c.index}. ${c.text}  (${state})`);
    for (const r of c.records) out.line(`         ${evidenceLine(r)}`);
  }
  if (e.orphans.length) {
    out.line('  Evidence for criteria that no longer exist (edited or removed):');
    for (const r of e.orphans) out.line(`    "${r.criterion}": ${evidenceLine(r)}`);
  }
  for (const p of e.problems) out.warn(p);
}

function evidenceLine(r: StoryEvidence['orphans'][number]): string {
  const at = [short(r.commit) ? `at ${short(r.commit)}` : '', r.recorded ? r.recorded.slice(0, 10) : ''].filter(Boolean).join(', ');
  const changed = r.changed.length ? `; changed since: ${capList(r.changed, 3, ', ')}` : '';
  return `${r.kind} ${r.ref}${at ? ` (${at})` : ''}${r.note ? ` - ${r.note}` : ''}${changed}`;
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
    const change = await mutateWork(cli, ({ scan }) => setStatus(scan, getArtifact(scan, id), status, { force: options.force }));
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
    const duplicates = duplicateIds(scan);
    const duplicated = new Set(duplicates.map((d) => d.id));
    warnDuplicates(cli, duplicates);
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
        duplicates,
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
        for (const s of col.stories) {
          out.line(`${indent}  ${s.id}  ${pad(s.title, titleWidth)}  ${s.priority ?? ''}${duplicated.has(s.id) ? '  (duplicate ID)' : ''}`.trimEnd());
        }
      }
    };
    for (const group of board.groups) {
      out.line(group.horizon === 'unscheduled' ? 'NO HORIZON' : upper(group.horizon));
      for (const e of group.epics) {
        const done = `${e.progress.done}/${e.progress.total - e.progress.cancelled} done`;
        out.line(`${e.epic.id}  ${pad(e.epic.title, titleWidth + 2)}  ${pad(e.epic.status, 8)}  ${done}${duplicated.has(e.epic.id) ? '  (duplicate ID)' : ''}`);
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
// work next
// ---------------------------------------------------------------------------

export interface WorkNextOptions {
  epic?: string;
  limit?: string;
  explain?: boolean;
  json?: boolean;
}

/**
 * `agileflow work next`: stories that can be picked up now, best first, with
 * the reasons. Read-only: nothing is assigned, started, or written.
 */
export async function runWorkNext(cli: Cli, options: WorkNextOptions): Promise<number> {
  return guarded(cli, options.json, async () => {
    const { scan } = await loadWork(cli);
    let limit = 5;
    if (options.limit !== undefined) {
      limit = Number(options.limit);
      if (!Number.isInteger(limit) || limit < 1) throw new UsageError(`--limit must be a positive whole number (got "${options.limit}")`);
    }
    const epic = options.epic ? resolvePartialId(options.epic, scan.epics.map((e) => e.id), 'epic') : undefined;
    const result = nextStories(scan, { epic, limit, explain: options.explain });
    warnDuplicates(cli, duplicateIds(scan));
    const item = (c: NextCandidate) => ({
      id: c.story.id,
      title: c.story.title,
      status: c.story.status,
      priority: c.story.priority ?? null,
      epic: c.story.epic ?? null,
      path: c.story.path,
      depends_on: c.dependsOn,
      unblocks: c.unblocks,
      reasons: c.reasons,
    });
    if (options.json) {
      cli.out.json({
        ...(epic ? { epic } : {}),
        eligible: result.eligible.map(item),
        totalEligible: result.totalEligible,
        ...(options.explain ? { notEligible: result.notEligible.map(item) } : {}),
        totalNotEligible: result.totalNotEligible,
      });
      return EXIT.OK;
    }
    const out = textOut(cli.out);
    const scope = epic ? ` in ${epic}` : '';
    if (!result.eligible.length) {
      out.line(`No story${scope} can be started now.`);
      if (result.totalNotEligible && !options.explain) {
        out.line(`${result.totalNotEligible} open stor${result.totalNotEligible === 1 ? 'y is' : 'ies are'} not eligible; \`agileflow work next --explain\` shows why.`);
      }
    } else {
      out.line(`Next${scope} (${result.eligible.length} of ${result.totalEligible} eligible)`);
      result.eligible.forEach((c, i) => {
        out.line(`  ${i + 1}. ${c.story.id}  ${c.story.priority ?? '-'}  ${c.story.title}`);
        out.line(`     ${c.reasons.join('; ')}`);
      });
    }
    if (options.explain && result.notEligible.length) {
      out.line();
      out.line(`Not eligible (${result.notEligible.length} of ${result.totalNotEligible})`);
      for (const c of result.notEligible) {
        out.line(`  ${c.story.id}  ${c.story.status}  ${c.story.priority ?? '-'}  ${c.story.title}`);
        out.line(`     ${c.reasons.join('; ')}`);
      }
    }
    out.line();
    out.line('Nothing was assigned or started. Start one with `agileflow work status <id> in-progress`.');
    return EXIT.OK;
  });
}

// ---------------------------------------------------------------------------
// work evidence
// ---------------------------------------------------------------------------

export interface WorkEvidenceOptions {
  criterion?: string;
  kind?: string;
  ref?: string;
  note?: string;
  file?: string[];
  json?: boolean;
}

/**
 * `agileflow work evidence <story>`: show per-criterion evidence, or record
 * evidence for one criterion (--criterion, --kind, --ref). Recording edits
 * only the story's agileflow-evidence block; it never checks boxes or
 * changes the status.
 */
export async function runWorkEvidence(cli: Cli, id: string, options: WorkEvidenceOptions): Promise<number> {
  return guarded(cli, options.json, async () => {
    const recording = options.criterion !== undefined || options.kind !== undefined || options.ref !== undefined;
    if (recording) {
      const missing = (['criterion', 'kind', 'ref'] as const).filter((k) => options[k] === undefined).map((k) => `--${k}`);
      if (missing.length) {
        throw new UsageError(`Recording evidence needs ${missing.join(', ')}`, [
          `agileflow work evidence ${clean(id)} --criterion <n|text> --kind ${EVIDENCE_KINDS.join('|')} --ref <test, file:line, or PR URL> [--note "..."] [--file <path>]`,
        ]);
      }
      const { story, recorded } = await mutateWork(cli, async ({ scan }) => {
        const story = getStory(scan, id);
        const recorded = await recordEvidence(scan, story, {
          criterion: options.criterion!,
          kind: options.kind!,
          ref: options.ref!,
          note: options.note,
          files: options.file?.flatMap(splitList),
          // Paths on the command line are relative to where it runs.
          cwd: cli.ctx.cwd,
        });
        return { story, recorded };
      });
      if (options.json) {
        cli.out.json(recorded);
        return EXIT.OK;
      }
      const out = textOut(cli.out);
      out.line(`${recorded.replaced ? 'Updated' : 'Recorded'} evidence for ${story.id} criterion ${recorded.criterion.index}: ${recorded.criterion.text}`);
      out.line(`  ${recorded.record.kind} ${recorded.record.ref}${recorded.record.commit ? ` at ${short(recorded.record.commit)}` : ''}`);
      const files = Object.keys(recorded.record.files ?? {});
      out.line(files.length ? `  Staleness is checked against: ${files.join(', ')}` : '  No files hashed: this evidence cannot go stale automatically (add --file <path> for the code it covers).');
      out.line(recorded.path);
      return EXIT.OK;
    }
    const { scan, paths } = await loadWork(cli);
    const story = getStory(scan, id);
    const evidence = await evaluateEvidence(paths.projectRoot, story.body);
    if (options.json) {
      cli.out.json({ id: story.id, path: story.path, ...evidenceJson(evidence) });
      return EXIT.OK;
    }
    const out = textOut(cli.out);
    out.line(story.id);
    out.line(story.title);
    out.line('Acceptance Criteria:');
    showEvidence(out, evidence);
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
  /** Resolve status.json vs Markdown disagreements with this side (otherwise such items are held back). */
  prefer?: string;
  json?: boolean;
}

/**
 * `agileflow work import v4`: convert a v4 backlog into Work items. Shows the
 * plan first; writes only with --yes or after confirmation. Never changes or
 * deletes the v4 files; re-running skips items already imported (legacy_id).
 * Items whose status.json and Markdown disagree are held back unless
 * --prefer json|markdown picks a side.
 */
export async function runWorkImport(cli: Cli, from: string, options: WorkImportOptions): Promise<number> {
  return guarded(cli, options.json, async () => {
    if (from?.trim().toLowerCase() !== 'v4') throw new UsageError(`Cannot import from "${from}"`, ['Supported: agileflow work import v4']);
    let prefer: ImportPreference | undefined;
    if (options.prefer !== undefined) {
      const p = options.prefer.trim().toLowerCase();
      if (p !== 'json' && p !== 'markdown') throw new UsageError(`--prefer must be json or markdown (got "${options.prefer}")`);
      prefer = p;
    }
    const { scan, paths, scope } = await loadWork(cli);
    const plan = await planV4Import(scan, { prefer });
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
      legacyPriority: p.legacyPriority,
      ...(p.type === 'story'
        ? { epic: p.epic ?? null, legacyEpic: p.legacyEpic ?? null, depends_on: p.dependsOn ?? [], legacyDependsOn: p.legacyDependsOn ?? [] }
        : {}),
      path: p.path,
      sources: p.sources,
    });
    const duplicateNote = (d: (typeof plan.duplicates)[number]) =>
      `legacy_id ${d.legacyId} is used by ${d.ids.length} work items (${d.paths.join(', ')}); items that refer to it are held back. Keep one and remove or re-label the others.`;

    if (!options.json) {
      const out = textOut(cli.out);
      out.line(`Import the v4 backlog into ${paths.root}/`);
      out.line(`Read: ${plan.sources.join(', ')} (never changed)`);
      const deps = (ids: string[] = []) => (ids.length ? capList(ids, 3, ', ') : '-');
      const legacyOf = new Map([...plan.epics.map((p) => [p.id, p.legacyId] as const)]);
      for (const e of scan.epics) if (e.legacy_id) legacyOf.set(e.id, e.legacy_id);
      const v4Status = (s: string | null) => (s === null ? '-' : clean(s));
      if (plan.epics.length) {
        out.line(`Epics (${plan.epics.length} new)`);
        out.lines(
          table(
            ['V4', 'NEW ID', 'V4 STATUS', 'STATUS', 'PRIORITY', 'TITLE'],
            plan.epics.map((p) => [p.legacyId, p.id, v4Status(p.legacyStatus), p.status, p.priority ?? '-', clean(p.title)]),
          ).map((l) => `  ${l}`),
        );
      }
      if (plan.stories.length) {
        out.line(`Stories (${plan.stories.length} new)`);
        out.lines(
          table(
            ['V4', 'NEW ID', 'V4 STATUS', 'STATUS', 'PRIORITY', 'EPIC', 'DEPENDS ON', 'TITLE'],
            plan.stories.map((p) => [
              p.legacyId,
              p.id,
              v4Status(p.legacyStatus),
              p.status,
              p.priority ?? '-',
              p.epic ? (legacyOf.get(p.epic) ?? p.legacyEpic ?? p.epic) : '-',
              deps(p.legacyDependsOn),
              clean(p.title),
            ]),
          ).map((l) => `  ${l}`),
        );
      }
      if (plan.remaps.length) {
        out.line('Remapped values (v4 -> Work)');
        for (const r of plan.remaps) {
          out.line(`  ${r.type} ${r.field}: ${clean(r.from)} -> ${r.to}  (${r.items.length}: ${capList(r.items, 5, ', ')})`);
        }
      }
      if (plan.conflicts.length) {
        out.line(`Held back (${plan.conflicts.length}): status.json and Markdown disagree, or the item is ambiguous`);
        for (const c of plan.conflicts) {
          const lines = [
            ...c.fields.map((f) => `${f.field}: status.json "${f.json}", Markdown "${f.markdown}"`),
            ...c.reasons,
          ];
          lines.forEach((l, i) => out.line(`  ${i ? ' '.repeat(c.legacyId.length) : c.legacyId}  ${l}`));
        }
        if (plan.conflicts.some((c) => c.fields.length && !c.reasons.length)) {
          out.line('  Nothing is guessed. Fix the v4 files so they agree, or rerun with --prefer json or --prefer markdown.');
        }
      }
      if (plan.skipped.length) out.line(`Already imported: ${plan.skipped.length} (skipped)`);
      for (const d of plan.duplicates) out.warn(duplicateNote(d));
      for (const note of plan.notes) out.warn(note);
      if (!total) {
        out.line('Nothing to import.');
        return EXIT.OK;
      }
      if (!apply) {
        out.line();
        out.line(`Nothing was written. Run \`agileflow work import v4 --yes${prefer ? ` --prefer ${prefer}` : ''}\` to import (with the IDs shown above).`);
        return EXIT.OK;
      }
      if (!options.yes && !(await cli.prompter.confirm(`Create ${total} work item${total === 1 ? '' : 's'} in ${paths.root}/? The v4 files are not changed.`, true))) {
        out.line('Nothing was written.');
        return EXIT.OK;
      }
    }

    // Held under the project lock so two imports cannot write the same items twice.
    // Applied under the project lock, re-planned from a fresh scan inside it: two
    // imports cannot write the same items twice, and nothing is written if the
    // plan would differ from what was shown.
    const result = apply
      ? await mutate(cli, scope, async () => {
          const fresh = await loadWork(cli);
          const again = await planV4Import(fresh.scan, { prefer });
          const ids = (p: typeof plan) => [...p.epics, ...p.stories].map((i) => `${i.id} ${i.path}`).join('\n');
          if (ids(again) !== ids(plan)) {
            throw new WorkError('The workspace or the v4 backlog changed since the plan was made; nothing was written', [
              'Run `agileflow work import v4 --preview` again.',
            ]);
          }
          return applyV4Import(fresh.scan, again);
        })
      : { created: [] as string[] };
    if (options.json) {
      cli.out.json({
        applied: apply,
        root: paths.root,
        sources: plan.sources,
        prefer: plan.prefer,
        epics: plan.epics.map(item),
        stories: plan.stories.map(item),
        skipped: plan.skipped,
        conflicts: plan.conflicts,
        remaps: plan.remaps,
        duplicates: plan.duplicates,
        notes: plan.notes,
        created: result.created,
      });
      return EXIT.OK;
    }
    const out = textOut(cli.out);
    out.line();
    out.line(`Imported ${plan.epics.length} epic${plan.epics.length === 1 ? '' : 's'} and ${plan.stories.length} stor${plan.stories.length === 1 ? 'y' : 'ies'} into ${paths.root}/.`);
    if (plan.conflicts.length) out.line(`${plan.conflicts.length} held back; resolve them and run the import again (imported items are skipped).`);
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
  const scan = await scanWorkspace(paths);
  const result = validateWorkspace(scan);
  const [structure, ...checks] = result.passed[0] === 'workspace structure valid' ? result.passed : [null, ...result.passed];
  if (structure) diagnostics.push({ level: 'ok', message: structure });
  const n = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;
  diagnostics.push({ level: 'ok', message: n(result.counts.epics, 'epic') });
  diagnostics.push({ level: 'ok', message: result.counts.stories === 1 ? '1 story' : `${result.counts.stories} stories` });
  diagnostics.push({ level: 'ok', message: n(result.counts.decisions, 'decision') });
  for (const c of checks) if (c) diagnostics.push({ level: 'ok', message: c });
  // Titles, criteria, and file names come from files anyone can edit: never print their control characters.
  for (const issue of result.issues) diagnostics.push({ level: issue.level, message: clean(issue.message), ...(issue.detail ? { detail: issue.detail.map(clean) } : {}) });
  if (scan.exists) {
    for (const warning of describeIgnoredWorkPaths(paths, (await findIgnoredWorkPaths(paths)) ?? [])) diagnostics.push({ level: 'warn', message: warning });
  }
  const v4 = await v4BacklogHint(scope.root, scan);
  if (v4) diagnostics.push(v4);
  return { title: 'Agile Work', diagnostics };
}

/** A pointer to `work import v4 --preview` while a v4 backlog has items that are not imported yet. */
async function v4BacklogHint(projectRoot: string, scan: WorkScan): Promise<Diagnostic | null> {
  let backlog: Awaited<ReturnType<typeof readV4Backlog>>;
  try {
    backlog = await readV4Backlog(projectRoot);
  } catch {
    return { level: 'info', message: 'v4 backlog found', detail: ['Preview importing it with `agileflow work import v4 --preview` (the v4 files are never changed).'] };
  }
  if (!backlog.found) return null;
  const imported = new Set([...scan.epics, ...scan.stories].map((a) => a.legacy_id?.toUpperCase()).filter(Boolean));
  const pending = [...backlog.epics.keys(), ...backlog.stories.keys()].filter((id) => !imported.has(id)).length;
  if (!pending) return null;
  return {
    level: 'info',
    message: `v4 backlog found (${backlog.sources.join(', ')}): ${pending} item${pending === 1 ? '' : 's'} not imported`,
    detail: ['Preview importing it with `agileflow work import v4 --preview` (the v4 files are never changed).'],
  };
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
