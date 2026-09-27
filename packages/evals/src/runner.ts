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
import { allAdapters } from '@agileflow/providers';
import { createFetcher } from '@agileflow/registry';
import {
  askedUser,
  JudgeError,
  usedStructuredQuestion,
  type InteractionAssessment,
  type Judge,
  type RubricItemResult,
  type RubricResult,
} from './assertions';
import { checkForbid, diffSnapshots, evaluateRule, ruleLabel, snapshotTree, type FileChange, type SafetyViolation } from './checks';
import { createIsolatedEnv, personalSkillNames, realHomeDir, type IsolatedEnv } from './isolation';
import { activationMetrics, emptyConfusion, tally, wilsonInterval, type ActivationMetrics, type Interval } from './metrics';
import type { EvalDriver, Transcript } from './providers';
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
}

/** Where a run failed before it could be scored. */
export type RunErrorKind = 'fixture' | 'sandbox' | 'setup' | 'provider' | 'isolation' | 'judge' | 'check';

export interface RunResult {
  /** `error`: the run could not be scored (infrastructure, setup, provider crash or timeout, judge failure). */
  status: 'ok' | 'error';
  error: { kind: RunErrorKind; message: string } | null;
  activated: boolean;
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
  /** Personal skills the provider reported as visible (a failed isolation, or `--no-isolate`). */
  foreignSkills: string[];
  /** Scored and met every expectation: activation, rubric threshold, safety. */
  passed: boolean;
  sandbox: string | null;
}

export type ScenarioStatus = 'passed' | 'failed' | 'error';

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
  runs: RunResult[];
  /** Fraction of scored runs that activated (null when none was scored). */
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
  errored: number;
}

export interface SkillMetrics extends StatusCounts {
  skill: string;
  /** Activation over implicit trigger scenarios (explicit invocations are load checks, not triggers). */
  activation: ActivationMetrics;
  /** Explicit-invocation runs that loaded the skill. */
  explicit: { loaded: number; runs: number };
}

export interface EvalReport {
  provider: string;
  mode: 'activation' | 'full';
  questionPreference: InteractionPreference | null;
  /** Runs used an isolated HOME. */
  isolated: boolean;
  judge: string | null;
  results: ScenarioResult[];
  skills: SkillMetrics[];
  summary: StatusCounts &
    ActivationMetrics & {
      runs: number;
      erroredRuns: number;
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
    const ws = await loadWorkspace(scope);
    const prepared = await prepareAdd(
      services,
      ws,
      options.catalogDirs.map((d) => ({ id: path.basename(d), spec: { source: path.resolve(d) } })),
    );
    await commitAdd(services, ws, prepared);
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

/**
 * Run a scenario's setup script (POSIX `sh -e`) in the sandbox with a fixed
 * git identity, the run's (isolated) environment, and a timeout.
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
  ) {
    super(message);
  }
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
async function gradeRubric(ctx: RunContext, transcript: Transcript, fileChanges: FileChange[], repo: string): Promise<RubricResult | null> {
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
      const result = await evaluateRule(item, { transcript, fileChanges, repo });
      items.push({ criterion: ruleLabel(item), ...result, source: 'rule' });
    } catch (err) {
      throw new RunFailure('check', `rule check "${ruleLabel(item)}" failed: ${(err as Error).message}`);
    }
  }
  let judgeId: string | null = null;
  let ungraded: string[] = [];
  if (criteria.length && options.judge) {
    let graded: RubricResult;
    try {
      graded = await options.judge.grade(scenario.prompt, criteria, transcript);
    } catch (err) {
      throw new RunFailure('judge', `judge failed: ${(err as Error).message}`);
    }
    const missing = criteria.filter((c) => !graded.items.some((i) => i.criterion === c));
    if (missing.length) throw new RunFailure('judge', `judge did not grade: ${missing.join('; ')}`);
    judgeId = graded.judge ?? options.judge.id;
    items.push(...criteria.map((c) => ({ ...graded.items.find((i) => i.criterion === c)!, source: 'judge' as const })));
  } else {
    ungraded = criteria;
  }
  if (!items.length) return { judge: null, items, score: 0, ungraded };
  return { judge: judgeId, items, score: items.filter((i) => i.pass).length / items.length, ungraded };
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
  let foreignSkills: string[] = [];
  const result = (over: Partial<RunResult>): RunResult => ({
    status: 'ok',
    error: null,
    activated: false,
    otherActivations: [],
    askedUser: false,
    askedSource: 'heuristic',
    usedStructuredQuestion: false,
    interaction: null,
    transcript,
    rubric: null,
    violations,
    fileChanges,
    foreignSkills,
    passed: false,
    sandbox: options.keep && repo ? repo : null,
    ...over,
  });
  try {
    const fixtureDir = resolveFixture(options, scenario);
    if (fixtureDir && !(await pathExists(fixtureDir))) {
      throw new RunFailure('fixture', `fixture "${path.basename(fixtureDir)}" not found in ${options.fixturesDir}`);
    }
    root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agileflow-eval-'));
    repo = path.join(root, 'repo');
    if (ctx.isolate) {
      isolated = await createIsolatedEnv({ env: ctx.env, providers: [driver.id], realHome: ctx.realHome, home: path.join(root, 'home') });
    }
    let runEnv = isolated?.env ?? ctx.env;
    if (scenario.bin && Object.keys(scenario.bin).length) {
      if (options.setupAllowed && !options.setupAllowed(ctx.skillDir)) {
        throw new RunFailure(
          'setup',
          'scenario bin/ commands not installed: the skill is not from the official catalog or a local path you passed; review its evals/ and rerun with --allow-setup',
        );
      }
      // Outside the repository, so the agent cannot read the script it is being tested against.
      const binDir = path.join(root, 'bin');
      await fs.promises.mkdir(binDir, { recursive: true });
      for (const [name, script] of Object.entries(scenario.bin)) {
        const file = path.join(binDir, name);
        await fs.promises.writeFile(file, script.startsWith('#!') ? script : `#!/bin/sh\n${script}`, { mode: 0o755 });
        await fs.promises.chmod(file, 0o755);
      }
      runEnv = { ...runEnv, PATH: `${binDir}${path.delimiter}${runEnv.PATH ?? process.env.PATH ?? ''}` };
    }
    try {
      await prepareSandbox({ dir: repo, catalogDirs: options.catalogDirs ?? options.skillDirs, fixtureDir, env: runEnv, questionPreference: options.questionPreference });
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
        await runSetup(scenario.setup, repo, runEnv, options.setupTimeoutMs);
      } catch (err) {
        throw new RunFailure('setup', (err as Error).message);
      }
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
      });
    } catch (err) {
      transcript = emptyTranscript(driver.id, (err as Error).message);
    }
    fileChanges = diffSnapshots(before, await snapshotTree(repo));
    const homeChanges = isolated && homeBefore ? diffSnapshots(homeBefore, await snapshotTree(isolated.home, { exclude: [] }), '~/') : [];
    // Safety is checked even when the provider crashed afterwards.
    violations = checkForbid(scenario.forbid, { transcript, fileChanges: [...fileChanges, ...homeChanges], repo });
    if (transcript.error) throw new RunFailure('provider', `provider failed: ${transcript.error}`);

    foreignSkills = (transcript.visibleSkills ?? []).filter((s) => ctx.personalSkills.has(s) && !ctx.catalogIds.includes(s));
    if (ctx.isolate && foreignSkills.length) {
      throw new RunFailure('isolation', `isolation failed: the provider sees personal skills: ${foreignSkills.join(', ')}`);
    }
    if (mode === 'full') transcript.changes = await collectChanges(repo);

    const activated = driver.activated(transcript, scenario.skill);
    const otherActivations = ctx.catalogIds.filter((id) => id !== scenario.skill && driver.activated(transcript, id));
    const rubric = await gradeRubric(ctx, transcript, fileChanges, repo);
    let interaction: InteractionAssessment | null = null;
    if (scenario.interaction && options.judge?.assessInteraction && mode === 'full') {
      try {
        interaction = await options.judge.assessInteraction(scenario.prompt, scenario.interaction, transcript);
      } catch (err) {
        throw new RunFailure('judge', `interaction judge failed: ${(err as Error).message}`);
      }
    }
    const structured = usedStructuredQuestion(transcript);
    const rubricOk = !rubric || rubric.items.length === 0 || rubric.score >= ctx.rubricThreshold;
    return result({
      activated,
      otherActivations,
      askedUser: interaction ? interaction.askedUser || structured : askedUser(transcript),
      askedSource: interaction ? 'judge' : 'heuristic',
      usedStructuredQuestion: structured,
      interaction,
      rubric,
      passed: activated === scenario.assert.shouldActivate && rubricOk && violations.length === 0,
    });
  } catch (err) {
    const kind = err instanceof RunFailure ? err.kind : err instanceof JudgeError ? 'judge' : 'sandbox';
    return result({ status: 'error', error: { kind, message: `run ${runIndex + 1}: ${(err as Error).message}` } });
  } finally {
    await isolated?.dispose().catch(() => undefined);
    if (root) {
      if (options.keep) await fs.promises.rm(path.join(root, 'home'), { recursive: true, force: true });
      else await fs.promises.rm(root, { recursive: true, force: true });
    }
  }
}

function summarizeScenario(ctx: RunContext, runResults: RunResult[], passRate: number): ScenarioResult {
  const { scenario, options } = ctx;
  const scored = runResults.filter((r) => r.status === 'ok');
  const matches = scored.filter((r) => r.activated === scenario.assert.shouldActivate).length;
  const graded = scored.filter((r) => r.rubric && r.rubric.items.length);
  const rubricScore = graded.length ? graded.reduce((sum, r) => sum + r.rubric!.score, 0) / graded.length : null;
  const rubricPass = rubricScore === null ? null : rubricScore >= ctx.rubricThreshold;
  const violations = runResults.reduce((n, r) => n + r.violations.length, 0);
  const safetyPass = scenario.forbid ? violations === 0 : null;
  const interaction = scenario.interaction
    ? summarizeInteraction(scenario.interaction.ambiguity, options.questionPreference ?? 'provider-default', scored, passRate)
    : null;
  const activationPass = scored.length > 0 && matches / scored.length >= passRate;
  const errors = runResults.filter((r) => r.error).map((r) => r.error!.message);
  const passedRuns = scored.filter((r) => r.passed).length;
  // A safety violation fails the scenario even when the run also errored.
  const status: ScenarioStatus =
    safetyPass === false
      ? 'failed'
      : errors.length
        ? 'error'
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
    runs: runResults,
    activationRate: scored.length ? scored.filter((r) => r.activated).length / scored.length : null,
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

function loadErrorResult(skill: string, errors: string[]): ScenarioResult {
  return {
    skill,
    scenario: '(load)',
    kind: 'standard',
    expected: false,
    invocation: 'implicit',
    status: 'error',
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
    errors,
  };
}

function countStatus(results: ScenarioResult[]): StatusCounts {
  return {
    scenarios: results.length,
    passed: results.filter((r) => r.status === 'passed').length,
    failed: results.filter((r) => r.status === 'failed').length,
    errored: results.filter((r) => r.status === 'error').length,
  };
}

/**
 * Activation precision/recall/F1 over implicit trigger scenarios, counting
 * scored runs only: a crashed or timed-out run is an error, never a true
 * negative. Explicit invocations are load checks and are counted separately.
 */
export function skillMetrics(results: ScenarioResult[]): SkillMetrics[] {
  const bySkill = new Map<string, ScenarioResult[]>();
  for (const r of results) bySkill.set(r.skill, [...(bySkill.get(r.skill) ?? []), r]);
  return [...bySkill.entries()].map(([skill, rs]) => {
    const c = emptyConfusion();
    const explicit = { loaded: 0, runs: 0 };
    for (const r of rs) {
      for (const run of r.runs) {
        if (run.status !== 'ok') continue;
        if (r.invocation === 'explicit') {
          explicit.runs++;
          if (run.activated) explicit.loaded++;
        } else tally(c, r.expected, run.activated);
      }
    }
    return { skill, ...countStatus(rs), activation: activationMetrics(c), explicit };
  });
}

export async function runEvals(options: RunEvalsOptions): Promise<EvalReport> {
  const env = options.env ?? process.env;
  const runs = options.runs ?? 1;
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`runs must be a positive integer (got ${runs})`);
  const mode = options.mode ?? 'activation';
  const passRate = options.passRate ?? 1;
  const isolate = options.isolate !== false;
  const realHome = options.realHome ?? realHomeDir(env);
  const catalog = options.catalogDirs ?? options.skillDirs;
  const base = {
    options,
    env,
    mode,
    catalogIds: catalog.map((d) => path.basename(d)),
    personalSkills: await personalSkillNames(realHome, env),
    isolate,
    realHome,
    rubricThreshold: options.rubricThreshold ?? 0.75,
  };
  const results: ScenarioResult[] = [];

  for (const skillDir of options.skillDirs) {
    const { scenarios, errors } = await loadScenarios(skillDir);
    if (errors.length) results.push(loadErrorResult(path.basename(skillDir), errors));
    for (const scenario of scenarios) {
      if (options.filter && !options.filter(scenario)) continue;
      const ctx: RunContext = { ...base, scenario, skillDir };
      const runResults: RunResult[] = [];
      for (let i = 0; i < runs; i++) {
        options.onProgress?.(`${options.driver.id}: ${scenario.skill}/${scenario.name} (run ${i + 1}/${runs})`);
        runResults.push(await executeRun(ctx, i));
      }
      results.push(summarizeScenario(ctx, runResults, passRate));
    }
  }

  const skills = skillMetrics(results);
  const total = emptyConfusion();
  for (const s of skills) {
    total.truePositive += s.activation.truePositive;
    total.falsePositive += s.activation.falsePositive;
    total.falseNegative += s.activation.falseNegative;
    total.trueNegative += s.activation.trueNegative;
  }
  const adversarial = results.filter((r) => r.kind === 'adversarial');
  const allRuns = results.flatMap((r) => r.runs);
  return {
    provider: options.driver.id,
    mode,
    questionPreference: options.questionPreference ?? null,
    isolated: isolate,
    judge: options.judge?.id ?? null,
    results,
    skills,
    summary: {
      ...countStatus(results),
      ...activationMetrics(total),
      runs: allRuns.length,
      erroredRuns: allRuns.filter((r) => r.status === 'error').length,
      adversarial: { ...countStatus(adversarial), violations: adversarial.reduce((n, r) => n + r.runs.reduce((m, x) => m + x.violations.length, 0), 0) },
    },
  };
}
