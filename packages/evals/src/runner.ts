import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import {
  commitAdd,
  copyTree,
  createContext,
  loadWorkspace,
  pathExists,
  prepareAdd,
  projectScope,
  setConfigValue,
  type InteractionPreference,
} from '@agileflow/core';
import { allAdapters, findExecutable } from '@agileflow/providers';
import { createFetcher } from '@agileflow/registry';
import {
  askedUser,
  JudgeError,
  usedStructuredQuestion,
  type InteractionAssessment,
  type Judge,
  type JudgeInfo,
  type RubricItemResult,
  type RubricResult,
} from './assertions';
import {
  checkForbid,
  diffSnapshots,
  evaluateRule,
  matchesGlob,
  ruleLabel,
  snapshotTree,
  type CheckContext,
  type FileChange,
  type SafetyViolation,
} from './checks';
import { isAborting, trackDisposer } from './cleanup';
import { allowedEnv, createIsolatedEnv, personalSkillNames, realHomeDir, type AuthInfo, type IsolatedEnv } from './isolation';
import { activationMetrics, emptyConfusion, ratio, tally, wilsonInterval, type ActivationMetrics, type Interval } from './metrics';
import { loadedSkillPaths, type EvalDriver, type Transcript } from './providers';
import type { PreflightIssue } from './report';
import { commandVersion, describeFixture, describeSkill, type FixtureInfo, type SkillInfo } from './versions';
import { expectedAsk, loadScenarios, type Ambiguity, type AskExpectation, type LoadedScenario } from './scenarios';

const execFileAsync = promisify(execFile);

export interface RunEvalsOptions {
  /** Skills whose scenarios run. */
  skillDirs: string[];
  /** Skills installed in every sandbox (defaults to `skillDirs`); more skills measure precision. */
  catalogDirs?: string[];
  driver: EvalDriver;
  judge?: Judge | null;
  runs?: number;
  mode?: 'activation' | 'full';
  fixturesDir?: string;
  defaultFixture?: string;
  model?: string;
  timeoutMs?: number;
  env?: Record<string, string | undefined>;
  /** Minimum fraction of rubric items that must pass. */
  rubricThreshold?: number;
  /** Minimum fraction of runs whose activation must match. */
  passRate?: number;
  filter?: (scenario: LoadedScenario) => boolean;
  onProgress?: (message: string) => void;
  /** Keep sandbox repositories for inspection (the isolated HOME, which holds login copies, is always removed). */
  keep?: boolean;
  /** Project `interaction.questionPreference` in every sandbox (default: provider-default). */
  questionPreference?: InteractionPreference;
  /**
   * Run the provider and setup scripts with an isolated HOME/XDG/AgileFlow
   * environment holding only the provider's login files (default true).
   */
  isolate?: boolean;
  /** Real HOME to copy logins from and to check for leaked personal skills (default: from `env`). */
  realHome?: string;
  /** Whether scenario `setup` scripts of this skill may run (default: all). */
  setupAllowed?: (skillDir: string) => boolean;
  /** Timeout for one scenario `setup` script (default 120 s). */
  setupTimeoutMs?: number;
  /** Write each run's raw provider transcript into this directory (the report points at the file). */
  transcriptDir?: string;
  /** Called with the report so far after each scenario finishes (for incremental `--out` files). */
  onScenario?: (partial: EvalReport) => void | Promise<void>;
  /** Run `heldOut` scenarios too (comparisons do; ordinary authoring runs skip them). */
  includeHeldOut?: boolean;
  /** Skill directories whose versions and hashes the report records (default: the installed catalog, then `skillDirs`). */
  describeDirs?: string[];
}

/**
 * Why a run could not be scored: the infrastructure failed (`fixture`,
 * `sandbox`, `setup`, `provider`, `judge`, `check`), the measurement was
 * contaminated (`isolation`), or required criteria were never graded
 * (`ungraded`, e.g. `--judge none` with judge rubric items). `scenario`
 * counts scenario files that failed to load (in `summary.errorKinds` only).
 */
export type RunErrorKind = 'fixture' | 'sandbox' | 'setup' | 'provider' | 'isolation' | 'judge' | 'check' | 'ungraded' | 'scenario';

/** Which copy of the skill under test the provider loaded. */
export interface Provenance {
  /** SKILL.md paths the transcript shows being loaded for the skill under test (as the provider wrote them). */
  loadedFrom: string[];
  /**
   * `sandbox`: every loaded path is the sandbox install; `outside`: at least
   * one is not (a personal or same-named copy: an isolation error);
   * `unverified`: it activated but the provider did not say from where.
   * null when the skill did not activate.
   */
  source: 'sandbox' | 'outside' | 'unverified' | null;
  /** The provider reported its visible skills, so the personal-skill leak check ran. */
  visibilityChecked: boolean;
}

export interface RunResult {
  /** `error`: the run could not be scored (infrastructure, contamination, or ungraded criteria; see `error.kind`). */
  status: 'ok' | 'error';
  error: { kind: RunErrorKind; message: string } | null;
  /** Observed activation; kept on errored runs as evidence (see `activationObserved`). */
  activated: boolean;
  /**
   * The provider finished and the activation reading is trustworthy (not
   * contaminated), even if grading failed afterwards. Activation metrics
   * count these runs.
   */
  activationObserved: boolean;
  provenance: Provenance;
  /** Other catalog skills that activated in this run (trigger conflicts). */
  otherActivations: string[];
  /**
   * The agent stopped to ask the user something: the interaction judge's
   * answer when it ran, otherwise `askedUser()` (native tool or a closing question).
   */
  askedUser: boolean;
  askedSource: 'judge' | 'heuristic';
  /** It asked through the provider's structured question tool. */
  usedStructuredQuestion: boolean;
  /** Judge's view of how it handled the ambiguity (interaction scenarios, full mode). */
  interaction: InteractionAssessment | null;
  transcript: Transcript;
  rubric: RubricResult | null;
  /** Broken `forbid` rules (checked even when the run errored). */
  violations: SafetyViolation[];
  /** Repository files the run created, modified, or deleted (null when the provider did not run). */
  fileChanges: FileChange[] | null;
  /** Changed files outside the scenario's `assert.changes` globs (null when it declares none). */
  unexpectedChanges: string[] | null;
  /** Personal skills the provider reported as visible (a failed isolation, or `--no-isolate`). */
  foreignSkills: string[];
  /**
   * Positive full-mode runs: every graded rubric item passed (and the
   * interaction judge, when it ran, found the task succeeded). null when not
   * measured.
   */
  taskCompleted: boolean | null;
  /** The judge's raw reply or error output when grading failed (truncated). */
  judgeReply: string | null;
  /** The raw provider transcript, when `transcriptDir` was set. */
  transcriptFile: string | null;
  /** Scored and met every expectation: activation, rubric threshold, safety. */
  passed: boolean;
  sandbox: string | null;
}

/**
 * `passed`: the required checks ran and met their criteria. `failed`: the
 * skill ran and behaved incorrectly (wrong activation, rubric, safety).
 * `inconclusive`: a run could not be scored (infrastructure error,
 * contamination, or ungraded criteria), so quality was not established.
 * `not-run`: the scenario never ran (see `notRun` for why).
 */
export type ScenarioStatus = 'passed' | 'failed' | 'inconclusive' | 'not-run';

/**
 * Why a scenario did not run: excluded by `--scenario`, held out from
 * authoring runs, stopped by a failed preflight, its comparison arm was
 * unavailable, or its file is invalid.
 */
export type NotRunReason = 'filtered' | 'held-out' | 'preflight' | 'unavailable' | 'invalid-scenario';

export interface PassRate {
  passed: number;
  /** Scored runs (errored runs excluded). */
  runs: number;
  rate: number | null;
  /** Wilson 95% interval, when more than one run was scored. */
  ci95: Interval | null;
}

export interface ScenarioResult {
  skill: string;
  scenario: string;
  kind: 'standard' | 'adversarial';
  expected: boolean;
  invocation: 'implicit' | 'explicit';
  status: ScenarioStatus;
  notRun: NotRunReason | null;
  /** A held-out scenario (reported separately by comparisons). */
  heldOut: boolean;
  /** For negative scenarios: the neighboring skill the prompt belongs to. */
  neighbor: string | null;
  /** Fixture repository the scenario ran in, with its content hash (null without one). */
  fixture: FixtureInfo | null;
  runs: RunResult[];
  /** Fraction of runs with observed activation that activated (null when none was observed). */
  activationRate: number | null;
  askedRate: number;
  activationPass: boolean;
  rubricScore: number | null;
  rubricPass: boolean | null;
  /** null when the scenario has no `forbid` rules. */
  safetyPass: boolean | null;
  interaction: InteractionSummary | null;
  passRate: PassRate;
  /** `status === 'passed'`. */
  passed: boolean;
  errors: string[];
}

/**
 * How a scenario's runs handled ambiguity. The target is a good decision
 * boundary, not more questions: unwarranted questions (immaterial, or
 * answerable from the repository) count against it as much as missed ones.
 */
export interface InteractionSummary {
  ambiguity: Ambiguity;
  expectation: AskExpectation | null;
  runs: number;
  asked: number;
  structured: number;
  /** Runs graded by the interaction judge. */
  judged: number;
  /** Asked, but the question was immaterial or answerable from the repository. */
  unwarranted: number;
  proceededWithAssumption: number;
  unreasonableAssumptions: number;
  /** Runs that finished the change (taskSucceeded not null) and those that met the success points. */
  completed: number;
  succeeded: number;
  pass: boolean;
}

export interface StatusCounts {
  scenarios: number;
  passed: number;
  failed: number;
  inconclusive: number;
  notRun: number;
}

export interface RateCount {
  /** Runs that met the measure. */
  met: number;
  runs: number;
  rate: number | null;
  ci95: Interval | null;
}

export interface SkillMetrics extends StatusCounts {
  skill: string;
  /** Skill package version and content hashes (null for skills with no loadable directory). */
  version: string | null;
  contentHash: string | null;
  evalsHash: string | null;
  /** Implicit activation over implicit trigger scenarios (explicit invocations are load checks, not triggers). */
  activation: ActivationMetrics;
  /** Explicit-invocation runs that loaded the skill. */
  explicit: { loaded: number; runs: number };
  /** Positive full-mode runs that completed the task (`RunResult.taskCompleted`); errored runs excluded. */
  taskCompletion: RateCount;
}

export interface ProvenanceSummary {
  /** Activated runs whose skill file was the sandbox install. */
  sandbox: number;
  /** Activated runs where the provider did not say which file it loaded. */
  unverified: number;
  /** Activated runs that loaded a copy from outside the sandbox (isolation errors). */
  outside: number;
  /** Runs where the provider did not report its visible skills (leak check could not run). */
  visibilityUnchecked: number;
}

/** Exactly what ran, so reports can be compared and reproduced. Never holds secrets. */
export interface EvalEnvironment {
  /** `<provider CLI> --version` (null when it could not be read). */
  providerVersion: string | null;
  /** `--model` as requested (null: provider default), and the models the provider reported using. */
  model: { requested: string | null; observed: string[] };
  /** How the provider authenticated (from the first isolated run; `inherited` without isolation). */
  auth: AuthInfo | null;
  judge: JudgeInfo | null;
}

export interface EvalReport {
  provider: string;
  mode: 'activation' | 'full';
  questionPreference: InteractionPreference | null;
  /** Runs used an isolated HOME. */
  isolated: boolean;
  judge: string | null;
  environment: EvalEnvironment;
  results: ScenarioResult[];
  skills: SkillMetrics[];
  summary: StatusCounts &
    ActivationMetrics & {
      runs: number;
      erroredRuns: number;
      /** Errored runs by kind (only kinds that occurred). */
      errorKinds: Partial<Record<RunErrorKind, number>>;
      explicit: { loaded: number; runs: number };
      taskCompletion: RateCount;
      provenance: ProvenanceSummary;
      adversarial: StatusCounts & { violations: number };
    };
}

function gitEnv(env: Record<string, string | undefined>): NodeJS.ProcessEnv {
  return { ...(env as NodeJS.ProcessEnv), GIT_TERMINAL_PROMPT: '0' };
}

/** No hooks or signing from the user's git config inside sandboxes. */
const GIT_SAFE = ['-c', 'commit.gpgsign=false', '-c', `core.hooksPath=${os.devNull}`];

async function git(args: string[], cwd: string, env: Record<string, string | undefined>): Promise<void> {
  await execFileAsync('git', [...GIT_SAFE, ...args], { cwd, env: gitEnv(env) });
}

/** Create a throwaway repository with the catalog installed exactly as a user would get it. */
export async function prepareSandbox(options: {
  catalogDirs: string[];
  fixtureDir: string | null;
  env: Record<string, string | undefined>;
  questionPreference?: InteractionPreference;
  /** Directory to create the repository in (default: a new temp directory). */
  dir?: string;
}): Promise<string> {
  const dir = options.dir ?? (await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agileflow-eval-')));
  await fs.promises.mkdir(dir, { recursive: true });
  if (options.fixtureDir) {
    if (!(await pathExists(options.fixtureDir))) throw new Error(`fixture not found: ${options.fixtureDir}`);
    await copyTree(options.fixtureDir, dir);
  } else {
    await fs.promises.writeFile(path.join(dir, 'README.md'), '# Sandbox project\n');
  }
  const cacheDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agileflow-eval-cache-'));
  try {
    const ctx = createContext({ cwd: dir, cacheDir, env: options.env });
    const services = { ctx, fetcher: createFetcher({ ctx }), adapters: allAdapters() };
    const scope = projectScope(dir);
    await setConfigValue(scope, ['providers', 'claude', 'enabled'], true);
    if (options.questionPreference && options.questionPreference !== 'provider-default') {
      await setConfigValue(scope, ['interaction', 'questionPreference'], options.questionPreference);
    }
    // An empty catalog is a comparison baseline: nothing installed.
    if (options.catalogDirs.length) {
      const ws = await loadWorkspace(scope);
      const prepared = await prepareAdd(
        services,
        ws,
        options.catalogDirs.map((d) => ({ id: path.basename(d), spec: { source: path.resolve(d) } })),
      );
      await commitAdd(services, ws, prepared);
    }
  } finally {
    await fs.promises.rm(cacheDir, { recursive: true, force: true });
  }
  await git(['init', '--quiet', '--initial-branch=main'], dir, options.env);
  await git(['add', '-A'], dir, options.env);
  await git(['-c', 'user.name=AgileFlow Eval', '-c', 'user.email=eval@agileflow.invalid', 'commit', '--quiet', '-m', 'sandbox'], dir, options.env);
  return dir;
}

/** `git status -z` entries: status code and path (renames report the new path). */
function parsePorcelainZ(out: string): Array<{ code: string; file: string }> {
  const tokens = out.split('\0');
  const entries: Array<{ code: string; file: string }> = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (t.length < 4) continue;
    const code = t.slice(0, 2);
    entries.push({ code, file: t.slice(3) });
    if (code[0] === 'R' || code[0] === 'C') i++; // the next token is the original path
  }
  return entries;
}

/**
 * What a run changed in the sandbox, as the judge should see it: `git status`
 * plus the diff of tracked files and the full content of new files. Tool-call
 * inputs in the transcript are truncated, so this is the evidence for rubric
 * items about the files the agent produced.
 */
export async function collectChanges(cwd: string, limit = 12000): Promise<string> {
  const run = async (args: string[]) => (await execFileAsync('git', args, { cwd, maxBuffer: 1 << 24 })).stdout;
  try {
    const entries = parsePorcelainZ(await run(['status', '--porcelain=v1', '-z', '--untracked-files=all']));
    if (!entries.length) return '(no changes)';
    let out = `${entries.map((e) => `${e.code} ${e.file}`).join('\n')}\n\n${await run(['diff'])}`;
    for (const e of entries) {
      if (e.code !== '??') continue;
      out += `\n--- new file: ${e.file}\n${await fs.promises.readFile(path.join(cwd, e.file), 'utf8').catch(() => '(unreadable)')}`;
    }
    return out.length > limit ? `${out.slice(0, limit)}\n...[truncated]` : out;
  } catch (err) {
    return `(could not collect changes: ${(err as Error).message})`;
  }
}

const shellQuote = (value: string) => `'${value.replace(/'/g, `'\\''`)}'`;

/**
 * Environment for scenario `setup` and `bin` scripts: system variables only
 * (no provider credentials or configuration, no AgileFlow directories) and a
 * HOME without logins. This limits what a script can reach through its
 * environment; it is not an OS sandbox, so only trusted scripts run at all.
 */
export function scriptEnv(env: Record<string, string | undefined>, home: string): Record<string, string | undefined> {
  const out = allowedEnv(env, []);
  for (const key of Object.keys(out)) if (key.startsWith('AGILEFLOW_')) delete out[key];
  return {
    ...out,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: path.join(home, '.config'),
    XDG_DATA_HOME: path.join(home, '.local', 'share'),
    XDG_CACHE_HOME: path.join(home, '.cache'),
    XDG_STATE_HOME: path.join(home, '.local', 'state'),
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_TERMINAL_PROMPT: '0',
  };
}

/**
 * Run a scenario's setup script (POSIX `sh -e`) in the sandbox with a fixed
 * git identity, the given environment (`scriptEnv` in eval runs), and a timeout.
 */
export async function runSetup(
  script: string,
  cwd: string,
  env: Record<string, string | undefined> = process.env,
  timeoutMs = 120000,
): Promise<void> {
  try {
    await execFileAsync('sh', ['-e', '-c', script], {
      cwd,
      timeout: timeoutMs,
      killSignal: 'SIGKILL',
      env: {
        ...gitEnv(env),
        GIT_AUTHOR_NAME: 'Eval Author',
        GIT_AUTHOR_EMAIL: 'author@agileflow.invalid',
        GIT_COMMITTER_NAME: 'Eval Author',
        GIT_COMMITTER_EMAIL: 'author@agileflow.invalid',
      },
    });
  } catch (err) {
    const e = err as { stderr?: string; message: string; killed?: boolean; signal?: string };
    if (e.killed || e.signal === 'SIGKILL') throw new Error(`scenario setup timed out after ${Math.round(timeoutMs / 1000)}s`);
    throw new Error(`scenario setup failed: ${(e.stderr || e.message).trim().split('\n').slice(-3).join(' ')}`);
  }
}

export function summarizeInteraction(
  ambiguity: Ambiguity,
  preference: InteractionPreference,
  runs: RunResult[],
  passRate: number,
): InteractionSummary {
  const expectation = expectedAsk(ambiguity, preference);
  const asked = runs.filter((r) => r.askedUser).length;
  const judged = runs.filter((r) => r.interaction);
  const unwarranted = judged.filter(
    (r) =>
      r.askedUser &&
      (r.interaction!.questionWasMaterial === false || r.interaction!.questionWasRepositoryAnswerable === true),
  ).length;
  const proceeded = judged.filter((r) => r.interaction!.proceededWithAssumption);
  const unreasonable = proceeded.filter((r) => r.interaction!.assumptionWasReasonable === false).length;
  const completed = judged.filter((r) => r.interaction!.taskSucceeded !== null);
  const met = runs.filter((r) => {
    if (expectation === 'no-ask') return !r.askedUser;
    if (expectation === 'ask-or-defer') return r.askedUser || r.interaction?.taskSucceeded === true;
    return true;
  }).length;
  return {
    ambiguity,
    expectation,
    runs: runs.length,
    asked,
    structured: runs.filter((r) => r.usedStructuredQuestion).length,
    judged: judged.length,
    unwarranted,
    proceededWithAssumption: proceeded.length,
    unreasonableAssumptions: unreasonable,
    completed: completed.length,
    succeeded: completed.filter((r) => r.interaction!.taskSucceeded === true).length,
    // provider-default is the baseline AgileFlow does not shape: reported, never failed.
    pass: preference === 'provider-default' || (runs.length > 0 && met / runs.length >= passRate && unwarranted === 0 && unreasonable === 0),
  };
}

export interface PreferenceComparison {
  skill: string;
  scenario: string;
  ambiguity: Ambiguity;
  askedRate: Partial<Record<InteractionPreference, number>>;
  /**
   * For `choice` scenarios: prefer asks at least as often as provider-default,
   * and minimize no more often. `null` when a preference was not run or the
   * class has per-run expectations instead.
   */
  ordered: boolean | null;
}

/** Compare one scenario's asking rate across reports run with different preferences. */
export function compareQuestionPreferences(reports: EvalReport[]): PreferenceComparison[] {
  const rows = new Map<string, PreferenceComparison>();
  for (const report of reports) {
    const pref = report.questionPreference ?? 'provider-default';
    for (const r of report.results) {
      if (!r.interaction) continue;
      const key = `${r.skill}/${r.scenario}`;
      const row = rows.get(key) ?? { skill: r.skill, scenario: r.scenario, ambiguity: r.interaction.ambiguity, askedRate: {}, ordered: null };
      row.askedRate[pref] = r.askedRate;
      rows.set(key, row);
    }
  }
  for (const row of rows.values()) {
    const { prefer, minimize } = row.askedRate;
    const base = row.askedRate['provider-default'];
    if (row.ambiguity === 'choice' && prefer !== undefined && minimize !== undefined && base !== undefined) {
      row.ordered = prefer >= base && minimize <= base;
    }
  }
  return [...rows.values()];
}

function emptyTranscript(provider: string, error?: string): Transcript {
  return {
    provider,
    raw: '',
    toolCalls: [],
    userMessages: [],
    finalText: '',
    visibleSkills: null,
    exitCode: null,
    durationMs: 0,
    ...(error ? { error } : {}),
  };
}

class RunFailure extends Error {
  constructor(
    readonly kind: RunErrorKind,
    message: string,
    /** Evidence gathered before the failure (partial rubric, the judge's reply). */
    readonly evidence: { rubric?: RubricResult; judgeReply?: string } = {},
  ) {
    super(message);
  }
}

const JUDGE_REPLY_LIMIT = 4000;
const truncate = (text: string, limit: number) => (text.length > limit ? `${text.slice(0, limit)}\n...[truncated]` : text);

/** The judge's raw output from a failed call, when it produced any. */
function judgeReplyOf(err: unknown): string | undefined {
  const raw = err instanceof JudgeError ? err.raw : undefined;
  return raw?.trim() ? truncate(raw, JUDGE_REPLY_LIMIT) : undefined;
}

/** Is `file` (as the provider wrote it; relative paths are relative to the sandbox) inside one of `roots`? */
function insideAny(file: string, cwd: string, roots: string[]): boolean {
  if (file.startsWith('~')) return false;
  const abs = path.resolve(cwd, file);
  return roots.some((root) => {
    const rel = path.relative(root, abs);
    return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
  });
}

/** Where the activated skill was loaded from: the sandbox install, somewhere else, or unknown. */
export async function skillSource(paths: string[], sandbox: string): Promise<'sandbox' | 'outside' | 'unverified'> {
  if (!paths.length) return 'unverified';
  // Temp directories are often behind a symlink (macOS /var -> /private/var).
  const roots = [...new Set([sandbox, await fs.promises.realpath(sandbox).catch(() => sandbox)])];
  return paths.every((p) => insideAny(p, sandbox, roots)) ? 'sandbox' : 'outside';
}

interface RunContext {
  options: RunEvalsOptions;
  scenario: LoadedScenario;
  skillDir: string;
  env: Record<string, string | undefined>;
  mode: 'activation' | 'full';
  catalogIds: string[];
  personalSkills: Set<string>;
  isolate: boolean;
  realHome: string;
  rubricThreshold: number;
  fixture: FixtureInfo | null;
  /** Shared across runs: what the runs revealed about the environment. */
  observed: { auth: AuthInfo | null; models: Set<string> };
}

function resolveFixture(options: RunEvalsOptions, scenario: LoadedScenario): string | null {
  if (!options.fixturesDir) {
    if (scenario.fixture) {
      throw new RunFailure('fixture', `scenario uses fixture "${scenario.fixture}" but no fixtures directory was given (pass --fixtures <dir>)`);
    }
    return null;
  }
  return path.join(options.fixturesDir, scenario.fixture ?? options.defaultFixture ?? 'clean-node');
}

/** Grade the rubric: rule checks deterministically, string criteria with the judge. */
async function gradeRubric(
  ctx: RunContext,
  transcript: Transcript,
  fileChanges: FileChange[],
  repo: string,
  runCommand: CheckContext['runCommand'],
): Promise<RubricResult | null> {
  const { scenario, options } = ctx;
  if (!scenario.rubric?.length || !scenario.assert.shouldActivate || ctx.mode !== 'full') return null;
  const items: RubricItemResult[] = [];
  const criteria: string[] = [];
  for (const item of scenario.rubric) {
    if (typeof item === 'string') {
      criteria.push(item);
      continue;
    }
    try {
      const result = await evaluateRule(item, { transcript, fileChanges, repo, runCommand });
      items.push({ criterion: ruleLabel(item), ...result, source: 'rule' });
    } catch (err) {
      throw new RunFailure('check', `rule check "${ruleLabel(item)}" failed: ${(err as Error).message}`, { rubric: partial(items, criteria) });
    }
  }
  let judgeId: string | null = null;
  let ungraded: string[] = [];
  if (criteria.length && options.judge) {
    let graded: RubricResult;
    try {
      graded = await options.judge.grade(scenario.prompt, criteria, transcript);
    } catch (err) {
      // The rule checks already graded stay in the report, with the judge criteria marked ungraded.
      throw new RunFailure('judge', `judge failed: ${(err as Error).message}`, { rubric: partial(items, criteria), judgeReply: judgeReplyOf(err) });
    }
    const missing = criteria.filter((c) => !graded.items.some((i) => i.criterion === c));
    if (missing.length) throw new RunFailure('judge', `judge did not grade: ${missing.join('; ')}`, { rubric: partial(items, criteria) });
    judgeId = graded.judge ?? options.judge.id;
    items.push(...criteria.map((c) => ({ ...graded.items.find((i) => i.criterion === c)!, source: 'judge' as const })));
  } else {
    ungraded = criteria;
  }
  if (!items.length) return { judge: null, items, score: 0, ungraded };
  return { judge: judgeId, items, score: items.filter((i) => i.pass).length / items.length, ungraded };
}

/** Rubric graded so far, with the rest left ungraded. */
function partial(items: RubricItemResult[], ungraded: string[]): RubricResult {
  return { judge: null, items: [...items], score: items.length ? items.filter((i) => i.pass).length / items.length : 0, ungraded };
}

/** Did a positive full-mode run complete the task? null when nothing measured it. */
function taskCompleted(rubric: RubricResult | null, interaction: InteractionAssessment | null): boolean | null {
  const rubricMet = rubric && rubric.items.length && !rubric.ungraded.length ? rubric.items.every((i) => i.pass) : null;
  const succeeded = interaction?.taskSucceeded ?? null;
  if (rubricMet === null) return succeeded;
  return rubricMet && succeeded !== false;
}

/** Keep the raw transcript next to the report; evidence storage failing never fails the run. */
async function saveTranscript(ctx: RunContext, runIndex: number, raw: string): Promise<string | null> {
  const dir = ctx.options.transcriptDir;
  if (!dir || !raw) return null;
  const parts = [ctx.options.driver.id, ctx.options.questionPreference, ctx.scenario.skill, ctx.scenario.name, `run${runIndex + 1}`];
  const file = path.join(dir, `${parts.filter(Boolean).join('-').replace(/[^A-Za-z0-9._-]+/g, '_')}.jsonl`);
  try {
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(file, raw);
    return file;
  } catch {
    return null;
  }
}

async function executeRun(ctx: RunContext, runIndex: number): Promise<RunResult> {
  const { options, scenario, mode } = ctx;
  const driver = options.driver;
  let root: string | null = null;
  let repo: string | null = null;
  let isolated: IsolatedEnv | null = null;
  let transcript = emptyTranscript(driver.id);
  let violations: SafetyViolation[] = [];
  let fileChanges: FileChange[] | null = null;
  let unexpectedChanges: string[] | null = null;
  let foreignSkills: string[] = [];
  // Evidence is collected as the run goes, so an error later on (judge,
  // isolation) still reports what was observed before it.
  let activated = false;
  let activationObserved = false;
  let otherActivations: string[] = [];
  let rubric: RubricResult | null = null;
  let interaction: InteractionAssessment | null = null;
  let judgeReply: string | null = null;
  let transcriptFile: string | null = null;
  const provenance: Provenance = { loadedFrom: [], source: null, visibilityChecked: false };
  let untrack = () => {};
  const result = (over: Partial<RunResult>): RunResult => ({
    status: 'ok',
    error: null,
    activated,
    activationObserved,
    provenance,
    otherActivations,
    askedUser: false,
    askedSource: 'heuristic',
    usedStructuredQuestion: false,
    interaction,
    transcript,
    rubric,
    violations,
    fileChanges,
    unexpectedChanges,
    foreignSkills,
    taskCompleted: null,
    judgeReply,
    transcriptFile,
    passed: false,
    sandbox: options.keep && repo ? repo : null,
    ...over,
  });
  try {
    const fixtureDir = resolveFixture(options, scenario);
    if (fixtureDir && !(await pathExists(fixtureDir))) {
      throw new RunFailure('fixture', `fixture "${path.basename(fixtureDir)}" not found in ${options.fixturesDir}`);
    }
    if (isAborting()) throw new RunFailure('sandbox', 'not started: the eval was interrupted');
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agileflow-eval-'));
    const runRoot = root;
    // On abort the sandbox goes too, unless --keep (the isolated HOME tracks itself).
    untrack = trackDisposer(async () => {
      if (!options.keep) await fs.promises.rm(runRoot, { recursive: true, force: true });
    }, options.keep ? undefined : runRoot);
    repo = path.join(root, 'repo');
    // Everything before the provider run (sandbox install, setup scripts, bin
    // stand-ins) runs without the isolated HOME: login copies exist only while
    // the provider runs, in a directory that is not next to the sandbox.
    let runEnv = ctx.env;
    let pathPrefix = '';
    // Setup and bin scripts are the skill's code: no credentials, and a HOME without logins.
    const scriptHome = path.join(root, 'script-home');
    await fs.promises.mkdir(scriptHome, { recursive: true });
    await fs.promises.writeFile(path.join(scriptHome, '.gitconfig'), '[commit]\n\tgpgsign = false\n[init]\n\tdefaultBranch = main\n');
    if (scenario.bin && Object.keys(scenario.bin).length) {
      if (options.setupAllowed && !options.setupAllowed(ctx.skillDir)) {
        throw new RunFailure(
          'setup',
          'scenario bin/ commands not installed: the skill is not from the official catalog or a local path you passed; review its evals/ and rerun with --allow-setup',
        );
      }
      // Outside the repository, so the agent cannot read the script it is being tested against.
      const binDir = path.join(root, 'bin');
      const implDir = path.join(root, 'bin-impl');
      await fs.promises.mkdir(binDir, { recursive: true });
      await fs.promises.mkdir(implDir, { recursive: true });
      // The agent calls a wrapper that drops its environment (API keys included) before running the script.
      const scrubbed = Object.entries(scriptEnv(runEnv, scriptHome))
        .filter(([k]) => k !== 'PATH')
        .map(([k, v]) => `${k}=${shellQuote(v!)}`)
        .join(' ');
      for (const [name, script] of Object.entries(scenario.bin)) {
        const impl = path.join(implDir, name);
        await fs.promises.writeFile(impl, script.startsWith('#!') ? script : `#!/bin/sh\n${script}`, { mode: 0o755 });
        await fs.promises.chmod(impl, 0o755);
        const file = path.join(binDir, name);
        await fs.promises.writeFile(file, `#!/bin/sh\nexec env -i PATH="$PATH" ${scrubbed} ${shellQuote(impl)} "$@"\n`, { mode: 0o755 });
        await fs.promises.chmod(file, 0o755);
      }
      pathPrefix = `${binDir}${path.delimiter}`;
      runEnv = { ...runEnv, PATH: `${pathPrefix}${runEnv.PATH ?? process.env.PATH ?? ''}` };
    }
    // Isolated runs install the sandbox with a login-free environment (AgileFlow settings such as the link mode kept).
    const prepEnv = ctx.isolate
      ? {
          ...Object.fromEntries(Object.entries(ctx.env).filter(([k]) => k.startsWith('AGILEFLOW_') && !/^AGILEFLOW_(HOME|CONFIG_DIR|CACHE_DIR)$/.test(k))),
          ...scriptEnv(runEnv, scriptHome),
        }
      : runEnv;
    try {
      await prepareSandbox({ dir: repo, catalogDirs: options.catalogDirs ?? options.skillDirs, fixtureDir, env: prepEnv, questionPreference: options.questionPreference });
    } catch (err) {
      throw new RunFailure('sandbox', `sandbox setup failed: ${(err as Error).message}`);
    }
    if (scenario.setup) {
      if (options.setupAllowed && !options.setupAllowed(ctx.skillDir)) {
        throw new RunFailure(
          'setup',
          'setup script not run: the skill is not from the official catalog or a local path you passed; review its evals/ and rerun with --allow-setup',
        );
      }
      try {
        await runSetup(scenario.setup, repo, scriptEnv(runEnv, scriptHome), options.setupTimeoutMs);
      } catch (err) {
        throw new RunFailure('setup', (err as Error).message);
      }
    }

    if (ctx.isolate) {
      isolated = await createIsolatedEnv({ env: ctx.env, providers: [driver.id], realHome: ctx.realHome });
      ctx.observed.auth ??= isolated.auth.find((a) => a.provider === driver.id) ?? null;
      runEnv = { ...isolated.env, PATH: `${pathPrefix}${isolated.env.PATH ?? process.env.PATH ?? ''}` };
    }
    const before = await snapshotTree(repo);
    const homeBefore = isolated ? await snapshotTree(isolated.home, { exclude: [] }) : null;
    try {
      transcript = await driver.run({
        cwd: repo,
        prompt: scenario.prompt,
        skillId: scenario.skill,
        invocation: scenario.invocation,
        mode,
        model: options.model,
        timeoutMs: options.timeoutMs ?? 300000,
        env: runEnv,
        sandboxCommands: Object.keys(scenario.bin ?? {}),
        isolated: isolated !== null,
      });
    } catch (err) {
      transcript = emptyTranscript(driver.id, (err as Error).message);
    }
    transcriptFile = await saveTranscript(ctx, runIndex, transcript.raw);
    if (transcript.model) ctx.observed.models.add(transcript.model);
    fileChanges = diffSnapshots(before, await snapshotTree(repo));
    const expected = scenario.assert.changes;
    if (expected) unexpectedChanges = fileChanges.map((c) => c.path).filter((p) => !expected.some((g) => matchesGlob(p, g)));
    const homeChanges = isolated && homeBefore ? diffSnapshots(homeBefore, await snapshotTree(isolated.home, { exclude: [] }), '~/') : [];
    // The login copies are gone before any check command or judge runs.
    await isolated?.dispose().catch(() => undefined);
    // Safety is checked even when the provider crashed afterwards.
    violations = checkForbid(scenario.forbid, { transcript, fileChanges: [...fileChanges, ...homeChanges], repo });
    if (transcript.error) throw new RunFailure('provider', `provider failed: ${transcript.error}`);

    activated = driver.activated(transcript, scenario.skill);
    otherActivations = ctx.catalogIds.filter((id) => id !== scenario.skill && driver.activated(transcript, id));
    provenance.visibilityChecked = transcript.visibleSkills !== null;
    if (activated) {
      provenance.loadedFrom = loadedSkillPaths(transcript, scenario.skill);
      provenance.source = await skillSource(provenance.loadedFrom, repo);
    }
    // A personal skill the agent can see is contamination, including a
    // same-named copy of a catalog skill. Visible skills are reported by name
    // only, so in an isolated run a catalog name is the sandbox copy unless it
    // is listed twice; without isolation the personal copy is certainly there.
    const visible = transcript.visibleSkills ?? [];
    foreignSkills = [...new Set(visible)].filter(
      (s) => ctx.personalSkills.has(s) && (!ctx.catalogIds.includes(s) || !ctx.isolate || visible.filter((v) => v === s).length > 1),
    );
    if (provenance.source === 'outside') {
      const outside = provenance.loadedFrom.filter((p) => !p.startsWith(repo!) && (p.startsWith('~') || path.isAbsolute(p)));
      throw new RunFailure(
        'isolation',
        `contaminated: ${scenario.skill} was loaded from outside the sandbox (${(outside.length ? outside : provenance.loadedFrom).join(', ')}), not the copy under test`,
      );
    }
    if (ctx.isolate && foreignSkills.length) {
      throw new RunFailure('isolation', `isolation failed: the provider sees personal skills: ${foreignSkills.join(', ')}`);
    }
    activationObserved = true;
    if (mode === 'full') transcript.changes = await collectChanges(repo);

    const checkEnv = scriptEnv({ ...ctx.env, PATH: `${pathPrefix}${ctx.env.PATH ?? process.env.PATH ?? ''}` }, scriptHome);
    const sandbox = repo;
    const runCommand = async (command: string) => {
      if (options.setupAllowed && !options.setupAllowed(ctx.skillDir)) {
        throw new Error('check commands not run: the skill is not trusted to run code; review its evals/ and rerun with --allow-setup');
      }
      try {
        const res = await execFileAsync('sh', ['-c', command], { cwd: sandbox, env: gitEnv(checkEnv), timeout: options.setupTimeoutMs ?? 120000, killSignal: 'SIGKILL', maxBuffer: 1 << 24 });
        return { code: 0, output: `${res.stdout}${res.stderr}` };
      } catch (err) {
        const e = err as { code?: unknown; stdout?: string; stderr?: string; killed?: boolean; message: string };
        if (e.killed) throw new Error(`\`${command}\` timed out`);
        if (typeof e.code !== 'number') throw new Error(`\`${command}\` could not run: ${e.message}`);
        return { code: e.code, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
      }
    };
    rubric = await gradeRubric(ctx, transcript, fileChanges, repo, runCommand);
    if (scenario.interaction && options.judge?.assessInteraction && mode === 'full') {
      try {
        interaction = await options.judge.assessInteraction(scenario.prompt, scenario.interaction, transcript);
      } catch (err) {
        throw new RunFailure('judge', `interaction judge failed: ${(err as Error).message}`, { judgeReply: judgeReplyOf(err) });
      }
    }
    // Required criteria that no judge graded leave the run unscored, never passed.
    const ungraded = [...(rubric?.ungraded ?? [])];
    if (scenario.interaction && mode === 'full' && !options.judge?.assessInteraction) ungraded.push('interaction success criteria');
    if (ungraded.length) {
      throw new RunFailure('ungraded', `not graded without a judge (rerun with --judge claude): ${ungraded.join('; ')}`);
    }
    const structured = usedStructuredQuestion(transcript);
    const rubricOk = !rubric || rubric.items.length === 0 || rubric.score >= ctx.rubricThreshold;
    return result({
      askedUser: interaction ? interaction.askedUser || structured : askedUser(transcript),
      askedSource: interaction ? 'judge' : 'heuristic',
      usedStructuredQuestion: structured,
      taskCompleted: mode === 'full' && scenario.assert.shouldActivate ? taskCompleted(rubric, interaction) : null,
      passed: activated === scenario.assert.shouldActivate && rubricOk && violations.length === 0,
    });
  } catch (err) {
    const kind = err instanceof RunFailure ? err.kind : err instanceof JudgeError ? 'judge' : 'sandbox';
    if (err instanceof RunFailure && err.evidence.rubric) rubric = err.evidence.rubric;
    judgeReply = (err instanceof RunFailure ? err.evidence.judgeReply : judgeReplyOf(err)) ?? null;
    return result({
      status: 'error',
      error: { kind, message: `run ${runIndex + 1}: ${(err as Error).message}` },
      askedUser: transcript.raw ? askedUser(transcript) : false,
      usedStructuredQuestion: usedStructuredQuestion(transcript),
    });
  } finally {
    await isolated?.dispose().catch(() => undefined);
    if (root && !options.keep) await fs.promises.rm(root, { recursive: true, force: true });
    untrack();
  }
}

function summarizeScenario(ctx: RunContext, runResults: RunResult[], passRate: number): ScenarioResult {
  const { scenario, options } = ctx;
  const scored = runResults.filter((r) => r.status === 'ok');
  // Activation counts every run where it was reliably observed, even if grading failed afterwards.
  const observed = runResults.filter((r) => r.activationObserved);
  const matches = observed.filter((r) => r.activated === scenario.assert.shouldActivate).length;
  const graded = scored.filter((r) => r.rubric && r.rubric.items.length);
  const rubricScore = graded.length ? graded.reduce((sum, r) => sum + r.rubric!.score, 0) / graded.length : null;
  const rubricPass = rubricScore === null ? null : rubricScore >= ctx.rubricThreshold;
  const violations = runResults.reduce((n, r) => n + r.violations.length, 0);
  const safetyPass = scenario.forbid ? violations === 0 : null;
  const interaction = scenario.interaction
    ? summarizeInteraction(scenario.interaction.ambiguity, options.questionPreference ?? 'provider-default', scored, passRate)
    : null;
  const activationPass = observed.length > 0 && matches / observed.length >= passRate;
  // Wrong activation is a failure even when other runs errored, if those runs could not have rescued the rate.
  const activationFailed = runResults.length > 0 && (matches + runResults.length - observed.length) / runResults.length < passRate;
  const errors = runResults.filter((r) => r.error).map((r) => r.error!.message);
  const passedRuns = scored.filter((r) => r.passed).length;
  // A safety violation fails the scenario even when the run also errored.
  const status: ScenarioStatus =
    safetyPass === false || activationFailed
      ? 'failed'
      : errors.length
        ? 'inconclusive'
        : activationPass && rubricPass !== false && (interaction?.pass ?? true)
          ? 'passed'
          : 'failed';
  return {
    skill: scenario.skill,
    scenario: scenario.name,
    kind: scenario.kind,
    expected: scenario.assert.shouldActivate,
    invocation: scenario.invocation,
    status,
    notRun: null,
    heldOut: scenario.heldOut === true,
    neighbor: scenario.neighbor ?? null,
    fixture: ctx.fixture,
    runs: runResults,
    activationRate: observed.length ? observed.filter((r) => r.activated).length / observed.length : null,
    askedRate: scored.length ? scored.filter((r) => r.askedUser).length / scored.length : 0,
    activationPass,
    rubricScore,
    rubricPass,
    safetyPass,
    interaction,
    passRate: {
      passed: passedRuns,
      runs: scored.length,
      rate: scored.length ? passedRuns / scored.length : null,
      ci95: scored.length > 1 ? wilsonInterval(passedRuns, scored.length) : null,
    },
    passed: status === 'passed',
    errors,
  };
}

/** A scenario that never ran (filtered out, or stopped by a failed preflight). */
export function notRunResult(
  scenario: Pick<LoadedScenario, 'skill' | 'name' | 'kind' | 'assert' | 'invocation'> & Partial<Pick<LoadedScenario, 'heldOut' | 'neighbor'>>,
  reason: NotRunReason,
): ScenarioResult {
  return {
    skill: scenario.skill,
    scenario: scenario.name,
    kind: scenario.kind,
    expected: scenario.assert.shouldActivate,
    invocation: scenario.invocation,
    status: 'not-run',
    notRun: reason,
    heldOut: scenario.heldOut === true,
    neighbor: scenario.neighbor ?? null,
    fixture: null,
    runs: [],
    activationRate: null,
    askedRate: 0,
    activationPass: false,
    rubricScore: null,
    rubricPass: null,
    safetyPass: null,
    interaction: null,
    passRate: { passed: 0, runs: 0, rate: null, ci95: null },
    passed: false,
    errors: [],
  };
}

function loadErrorResult(skill: string, errors: string[]): ScenarioResult {
  return {
    ...notRunResult({ skill, name: '(load)', kind: 'standard', assert: { shouldActivate: false }, invocation: 'implicit' }, 'invalid-scenario'),
    status: 'inconclusive',
    errors,
  };
}

function countStatus(results: ScenarioResult[]): StatusCounts {
  return {
    scenarios: results.length,
    passed: results.filter((r) => r.status === 'passed').length,
    failed: results.filter((r) => r.status === 'failed').length,
    inconclusive: results.filter((r) => r.status === 'inconclusive').length,
    notRun: results.filter((r) => r.status === 'not-run').length,
  };
}

function rateCount(met: number, runs: number): RateCount {
  return { met, runs, rate: ratio(met, runs), ci95: runs > 1 ? wilsonInterval(met, runs) : null };
}

/** Task completion over runs that measured it; errored runs are excluded (never counted as incomplete). */
function taskCompletion(results: ScenarioResult[]): RateCount {
  const runs = results.flatMap((r) => r.runs).filter((run) => run.status === 'ok' && run.taskCompleted !== null);
  return rateCount(runs.filter((run) => run.taskCompleted).length, runs.length);
}

/**
 * Implicit activation precision/recall/F1 over implicit trigger scenarios,
 * counting runs whose activation was observed: a crashed, timed-out, or
 * contaminated run is an error, never a true negative. Explicit invocations
 * are load checks and are counted separately.
 */
export function skillMetrics(results: ScenarioResult[], info: SkillInfo[] = []): SkillMetrics[] {
  const bySkill = new Map<string, ScenarioResult[]>();
  for (const r of results) bySkill.set(r.skill, [...(bySkill.get(r.skill) ?? []), r]);
  return [...bySkill.entries()].map(([skill, rs]) => {
    const c = emptyConfusion();
    const explicit = { loaded: 0, runs: 0 };
    for (const r of rs) {
      for (const run of r.runs) {
        if (!run.activationObserved) continue;
        if (r.invocation === 'explicit') {
          explicit.runs++;
          if (run.activated) explicit.loaded++;
        } else tally(c, r.expected, run.activated);
      }
    }
    const pkg = info.find((i) => i.skill === skill);
    return {
      skill,
      version: pkg?.version ?? null,
      contentHash: pkg?.contentHash ?? null,
      evalsHash: pkg?.evalsHash ?? null,
      ...countStatus(rs),
      activation: activationMetrics(c),
      explicit,
      taskCompletion: taskCompletion(rs),
    };
  });
}

export interface ReportMeta {
  provider: string;
  mode: 'activation' | 'full';
  questionPreference: InteractionPreference | null;
  isolated: boolean;
  judge: string | null;
  environment: EvalEnvironment;
  skillInfo?: SkillInfo[];
}

/** Assemble a report (summary and per-skill metrics) from scenario results; also used for partial reports. */
export function buildEvalReport(meta: ReportMeta, results: ScenarioResult[]): EvalReport {
  const { skillInfo, ...rest } = meta;
  const skills = skillMetrics(results, skillInfo);
  const total = emptyConfusion();
  const explicit = { loaded: 0, runs: 0 };
  for (const s of skills) {
    total.truePositive += s.activation.truePositive;
    total.falsePositive += s.activation.falsePositive;
    total.falseNegative += s.activation.falseNegative;
    total.trueNegative += s.activation.trueNegative;
    explicit.loaded += s.explicit.loaded;
    explicit.runs += s.explicit.runs;
  }
  const adversarial = results.filter((r) => r.kind === 'adversarial');
  const allRuns = results.flatMap((r) => r.runs);
  const errorKinds: Partial<Record<RunErrorKind, number>> = {};
  for (const run of allRuns) if (run.error) errorKinds[run.error.kind] = (errorKinds[run.error.kind] ?? 0) + 1;
  const loadErrors = results.filter((r) => r.notRun === 'invalid-scenario').length;
  if (loadErrors) errorKinds.scenario = (errorKinds.scenario ?? 0) + loadErrors;
  const activatedRuns = allRuns.filter((r) => r.provenance.source !== null);
  return {
    ...rest,
    environment: { ...meta.environment, model: { ...meta.environment.model, observed: [...meta.environment.model.observed] } },
    results,
    skills,
    summary: {
      ...countStatus(results),
      ...activationMetrics(total),
      runs: allRuns.length,
      erroredRuns: allRuns.filter((r) => r.status === 'error').length,
      errorKinds,
      explicit,
      taskCompletion: taskCompletion(results),
      provenance: {
        sandbox: activatedRuns.filter((r) => r.provenance.source === 'sandbox').length,
        unverified: activatedRuns.filter((r) => r.provenance.source === 'unverified').length,
        outside: activatedRuns.filter((r) => r.provenance.source === 'outside').length,
        visibilityUnchecked: allRuns.filter((r) => r.transcript.exitCode !== null && !r.provenance.visibilityChecked).length,
      },
      adversarial: { ...countStatus(adversarial), violations: adversarial.reduce((n, r) => n + r.runs.reduce((m, x) => m + x.violations.length, 0), 0) },
    },
  };
}

/**
 * One provider/preference configuration, run scenario by scenario or run by
 * run. `runEvals` drives it over whole skills; comparisons interleave several
 * runners (one per arm) run by run.
 */
export interface EvalRunner {
  run(scenario: LoadedScenario, skillDir: string, runIndex: number): Promise<RunResult>;
  summarize(scenario: LoadedScenario, skillDir: string, runs: RunResult[]): Promise<ScenarioResult>;
  /** The report for these results, with what the runs revealed about the environment so far. */
  report(results: ScenarioResult[]): Promise<EvalReport>;
}

export async function createEvalRunner(options: RunEvalsOptions): Promise<EvalRunner> {
  const env = options.env ?? process.env;
  const mode = options.mode ?? 'activation';
  const passRate = options.passRate ?? 1;
  const isolate = options.isolate !== false;
  const realHome = options.realHome ?? realHomeDir(env);
  const catalog = options.catalogDirs ?? options.skillDirs;
  const observed: RunContext['observed'] = {
    auth: isolate ? null : { provider: options.driver.id, mode: 'inherited', envVars: [], files: [] },
    models: new Set(),
  };
  const base = {
    options,
    env,
    mode,
    catalogIds: catalog.map((d) => path.basename(d)),
    personalSkills: await personalSkillNames(realHome, env),
    isolate,
    realHome,
    rubricThreshold: options.rubricThreshold ?? 0.75,
    observed,
  };
  const environment: EvalEnvironment = {
    providerVersion: await commandVersion(options.driver.executable, env).catch(() => null),
    model: { requested: options.model ?? null, observed: [] },
    auth: null,
    judge: null,
  };
  // Versions of the installed copies first: in a comparison, each arm records the copy it ran.
  const describeDirs = options.describeDirs ?? [...catalog, ...options.skillDirs];
  const skillInfo: SkillInfo[] = [];
  for (const dir of describeDirs) {
    if (skillInfo.some((i) => i.skill === path.basename(dir))) continue;
    const info = await describeSkill(dir).catch(() => null);
    if (info) skillInfo.push(info);
  }
  const meta: ReportMeta = {
    provider: options.driver.id,
    mode,
    questionPreference: options.questionPreference ?? null,
    isolated: isolate,
    judge: options.judge?.id ?? null,
    environment,
    skillInfo,
  };
  const fixtures = new Map<string, FixtureInfo | null>();
  const context = async (scenario: LoadedScenario, skillDir: string): Promise<RunContext> => ({
    ...base,
    scenario,
    skillDir,
    fixture: await fixtureInfo(options, scenario, fixtures),
  });
  return {
    async run(scenario, skillDir, runIndex) {
      return executeRun(await context(scenario, skillDir), runIndex);
    },
    async summarize(scenario, skillDir, runs) {
      return summarizeScenario(await context(scenario, skillDir), runs, passRate);
    },
    async report(results) {
      environment.auth = observed.auth;
      environment.model.observed = [...observed.models].sort();
      environment.judge =
        (await options.judge?.describe?.().catch(() => null)) ?? (options.judge ? { id: options.judge.id, model: null, version: null, auth: null } : null);
      return buildEvalReport(meta, [...results]);
    },
  };
}

export async function runEvals(options: RunEvalsOptions): Promise<EvalReport> {
  const runs = options.runs ?? 1;
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`runs must be a positive integer (got ${runs})`);
  const runner = await createEvalRunner(options);
  const results: ScenarioResult[] = [];
  for (const skillDir of options.skillDirs) {
    const { scenarios, errors } = await loadScenarios(skillDir);
    if (errors.length) results.push(loadErrorResult(path.basename(skillDir), errors));
    for (const scenario of scenarios) {
      // An interrupted eval starts nothing new.
      if (isAborting()) break;
      if (options.filter && !options.filter(scenario)) {
        results.push(notRunResult(scenario, 'filtered'));
        continue;
      }
      if (scenario.heldOut && !options.includeHeldOut) {
        results.push(notRunResult(scenario, 'held-out'));
        continue;
      }
      const runResults: RunResult[] = [];
      for (let i = 0; i < runs && !isAborting(); i++) {
        options.onProgress?.(`${options.driver.id}: ${scenario.skill}/${scenario.name} (run ${i + 1}/${runs})`);
        runResults.push(await runner.run(scenario, skillDir, i));
      }
      results.push(await runner.summarize(scenario, skillDir, runResults));
      if (options.onScenario) await options.onScenario(await runner.report(results));
    }
  }
  return runner.report(results);
}

/**
 * The report of an eval that did not start (a failed preflight): every
 * scenario is `not-run`, with `filtered` for those `--scenario` excluded.
 */
export async function notRunReport(
  options: Pick<RunEvalsOptions, 'skillDirs' | 'driver' | 'mode' | 'questionPreference' | 'isolate' | 'judge' | 'model' | 'filter' | 'includeHeldOut'>,
  reason: NotRunReason,
): Promise<EvalReport> {
  const results: ScenarioResult[] = [];
  for (const skillDir of options.skillDirs) {
    const { scenarios, errors } = await loadScenarios(skillDir);
    if (errors.length) results.push(loadErrorResult(path.basename(skillDir), errors));
    for (const scenario of scenarios) {
      const why = options.filter && !options.filter(scenario) ? 'filtered' : scenario.heldOut && !options.includeHeldOut ? 'held-out' : reason;
      results.push(notRunResult(scenario, why));
    }
  }
  const meta: ReportMeta = {
    provider: options.driver.id,
    mode: options.mode ?? 'activation',
    questionPreference: options.questionPreference ?? null,
    isolated: options.isolate !== false,
    judge: options.judge?.id ?? null,
    environment: { providerVersion: null, model: { requested: options.model ?? null, observed: [] }, auth: null, judge: null },
    skillInfo: (await Promise.all(options.skillDirs.map((d) => describeSkill(d).catch(() => null)))).filter((x): x is SkillInfo => x !== null),
  };
  return buildEvalReport(meta, results);
}

/** Fixture id and content hash for a scenario (hashed once per fixture); null without one or when missing. */
async function fixtureInfo(options: RunEvalsOptions, scenario: LoadedScenario, cache: Map<string, FixtureInfo | null>): Promise<FixtureInfo | null> {
  if (!options.fixturesDir) return null;
  const id = scenario.fixture ?? options.defaultFixture ?? 'clean-node';
  if (!cache.has(id)) cache.set(id, await describeFixture(options.fixturesDir, id).catch(() => null));
  return cache.get(id) ?? null;
}

export interface PreflightOptions {
  skillDirs: string[];
  fixturesDir?: string;
  defaultFixture?: string;
  filter?: (scenario: LoadedScenario) => boolean;
  /** Scenario names asked for by name (`--scenario`); each must exist. */
  scenarioNames?: string[];
  setupAllowed?: (skillDir: string) => boolean;
  env?: Record<string, string | undefined>;
  includeHeldOut?: boolean;
}

/**
 * Everything that would make runs fail for reasons other than the skill,
 * found before any (paid) provider run: invalid scenario files, unknown
 * `--scenario` names, missing fixtures, setup scripts that are not allowed
 * to run, and missing `git`/`sh`. An empty list means the runs can start.
 */
export async function preflight(options: PreflightOptions): Promise<PreflightIssue[]> {
  const env = options.env ?? process.env;
  const issues: PreflightIssue[] = [];
  const seen = new Set<string>();
  let runnable = 0;
  let needsShell = false;
  for (const skillDir of options.skillDirs) {
    const skill = path.basename(skillDir);
    const { scenarios, errors } = await loadScenarios(skillDir);
    for (const e of errors) issues.push({ subject: skill, message: `invalid scenario: ${e}` });
    for (const scenario of scenarios) {
      seen.add(scenario.name);
      if (options.filter && !options.filter(scenario)) continue;
      if (scenario.heldOut && !options.includeHeldOut) continue;
      runnable++;
      const subject = `${scenario.skill}/${scenario.name}`;
      if (!options.fixturesDir) {
        if (scenario.fixture) issues.push({ subject, message: `uses fixture "${scenario.fixture}" but no fixtures directory was given (pass --fixtures <dir>)` });
      } else {
        const id = scenario.fixture ?? options.defaultFixture ?? 'clean-node';
        if (!(await pathExists(path.join(options.fixturesDir, id)))) issues.push({ subject, message: `fixture "${id}" not found in ${options.fixturesDir}` });
      }
      const code = [
        scenario.setup ? 'a setup script' : '',
        scenario.bin && Object.keys(scenario.bin).length ? 'bin/ commands' : '',
        scenario.rubric?.some((r) => typeof r === 'object' && r.run !== undefined) ? 'run checks' : '',
      ].filter(Boolean);
      if (code.length) {
        needsShell = true;
        if (options.setupAllowed && !options.setupAllowed(skillDir)) {
          issues.push({
            subject,
            message: `has ${code.join(' and ')} but the skill is not trusted to run code (only official catalog packages are); review its evals/ and pass --allow-setup`,
          });
        }
      }
    }
  }
  for (const name of options.scenarioNames ?? []) {
    if (!seen.has(name)) issues.push({ subject: '--scenario', message: `no scenario named "${name}"` });
  }
  if (!runnable && !issues.length) issues.push({ subject: 'scenarios', message: 'no scenarios to run' });
  for (const tool of ['git', ...(needsShell ? ['sh'] : [])]) {
    if ((await findExecutable(tool, env, process.platform)) === null) issues.push({ subject: tool, message: `\`${tool}\` is not installed or not on PATH (needed to build sandboxes${tool === 'sh' ? ' and run setup scripts' : ''})` });
  }
  return issues;
}
