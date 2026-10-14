import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  copyTree,
  describeSource,
  findProjectRoot,
  globalScope,
  packMembers,
  parsePack,
  loadWorkspace,
  parseSidecar,
  pathExists,
  projectScope,
  readProjectConfig,
  readTextIfExists,
  SIDECAR_FILE,
  SKILL_FILE,
  writeFileAtomic,
  type InteractionPreference,
  writeTree,
} from '@agileflow/core';
import {
  buildJsonReport,
  catalogSkills,
  claudeJudge,
  comparePackArms,
  compareSkillArms,
  loadScenarios,
  packActivation,
  runArms,
  compareProviders,
  compareQuestionPreferences,
  discoverSkillDirs,
  disposeActive,
  disposeActiveSync,
  DRIVERS,
  resetAbort,
  lintSkill,
  listCatalog,
  notRunReport,
  preflight,
  runEvals,
  type EvalReport,
  type Interval,
  type LintResult,
  type PreferenceComparison,
  type PreflightIssue,
  type RunResult,
  type ScenarioResult,
  type ArmSpec,
  type ArmTask,
  type Delta,
  type PackActivation,
  type PackActivationReport,
  type PackComparison,
  type SkillComparison,
} from '@agileflow/evals';
import { findExecutable } from '@agileflow/providers';
import type { Cli } from '../runtime';
import { EXIT, servicesFor, splitList, UsageError } from '../runtime';
import { table } from '../ui/tables';
import { cliVersion } from '../version';

export interface EvalOptions {
  lint?: boolean;
  catalog?: string;
  provider?: string;
  mode?: string;
  runs?: string;
  judge?: string;
  judgeModel?: string;
  model?: string;
  fixtures?: string;
  json?: boolean;
  out?: string;
  keep?: boolean;
  passRate?: string;
  rubricThreshold?: string;
  timeout?: string;
  scenario?: string[];
  questionPreference?: string;
  /** `--no-isolate` sets this to false. */
  isolate?: boolean;
  allowSetup?: boolean;
  /** `--compare [arms]`: true, or a comma-separated subset of baseline, released, candidate. */
  compare?: string | boolean;
  /** `--released <version|dir>`: the released copy to compare against (default: locked, else latest published). */
  released?: string;
  /** `--pack <name|installed>`: install the whole pack together and test activation across it. */
  pack?: string;
  seed?: string;
}

export function parsePositiveInt(flag: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value.trim()) || Number(value) < 1) throw new UsageError(`${flag} must be a whole number of at least 1 (got "${value}")`);
  return Number(value);
}

export function parseFraction(flag: string, value: string | undefined, options: { allowZero?: boolean } = {}): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (value.trim() === '' || !Number.isFinite(n) || n > 1 || n < 0 || (!options.allowZero && n === 0)) {
    throw new UsageError(`${flag} must be a number ${options.allowZero ? 'from 0' : 'greater than 0'} up to 1 (got "${value}")`);
  }
  return n;
}

export function parseSeconds(flag: string, value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const n = Number(value);
  if (value.trim() === '' || !Number.isFinite(n) || n <= 0) throw new UsageError(`${flag} must be a positive number of seconds (got "${value}")`);
  return n;
}

interface ResolvedSkills {
  dirs: string[];
  /** Skill dirs whose scenario `setup`/`bin` scripts may run without --allow-setup (official catalog packages only). */
  trusted: Set<string>;
  /** Temp directories to remove when the command ends. */
  temp: string[];
}

/**
 * Installed skills do not carry their eval scenarios (they are stripped on
 * install), so evaluate the exact locked package from the cache instead.
 * Only packages from the default official registry are trusted to run setup
 * scripts; anything from git, a path, or a registry that AGILEFLOW_REGISTRY or
 * the project config points at is not.
 */
async function lockedPackageDir(cli: Cli, projectRoot: string, id: string, resolved: ResolvedSkills): Promise<string | null> {
  const scope = projectScope(projectRoot);
  const ws = await loadWorkspace(scope);
  const entry = ws.lock.resolved[id];
  if (!entry || entry.ownership !== 'managed') return null;
  const services = await servicesFor(cli.ctx, scope);
  const pkg = await services.fetcher.fetchLocked(id, entry, scope.root);
  const temp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agileflow-eval-pkg-'));
  resolved.temp.push(temp);
  const dir = path.join(temp, id);
  await writeTree(dir, pkg.files);
  const projectRegistry = (await readProjectConfig(scope.configPath).catch(() => null))?.registry;
  if (describeSource(entry.source) === 'official' && !cli.ctx.env.AGILEFLOW_REGISTRY && !projectRegistry) resolved.trusted.add(dir);
  return dir;
}

async function resolveSkillDirs(cli: Cli, targets: string[], catalog: string | undefined): Promise<ResolvedSkills> {
  const { ctx } = cli;
  const resolved: ResolvedSkills = { dirs: [], trusted: new Set(), temp: [] };
  const catalogDir = catalog ? path.resolve(ctx.cwd, catalog) : null;
  if (catalogDir && !(await pathExists(catalogDir))) throw new UsageError(`--catalog ${catalog}: directory not found`);
  const projectRoot = await findProjectRoot(ctx.cwd, { homeDir: ctx.homeDir });
  const projectSkills = projectRoot ? path.join(projectRoot, '.agents', 'skills') : null;
  const add = (dir: string, trusted: boolean) => {
    if (resolved.dirs.includes(dir)) return;
    resolved.dirs.push(dir);
    if (trusted) resolved.trusted.add(dir);
  };
  // Local directories (a checkout, a cloned repository) are not trusted to
  // run setup scripts, however they were named: that takes --allow-setup.
  if (!targets.length) {
    if (catalogDir) {
      for (const dir of await listCatalog(catalogDir)) add(dir, false);
      return resolved;
    }
    if (projectRoot) {
      const ws = await loadWorkspace(projectScope(projectRoot));
      targets = Object.keys(ws.lock.resolved).sort();
    }
    if (!targets.length) {
      throw new UsageError('No skills to evaluate', [
        'Pass skill names or directories, or --catalog <dir> (e.g. --catalog skills).',
      ]);
    }
  }
  const unknown: string[] = [];
  try {
    for (const t of targets) {
      if (catalogDir && (await readTextIfExists(path.join(catalogDir, t, SKILL_FILE))) !== null) {
        add(path.join(catalogDir, t), false);
        continue;
      }
      const local = path.resolve(ctx.cwd, t);
      const discovered = (await pathExists(local)) ? await discoverSkillDirs(local) : [];
      if (discovered.length) {
        for (const dir of discovered) add(dir, false);
        continue;
      }
      const locked = projectRoot ? await lockedPackageDir(cli, projectRoot, t, resolved) : null;
      if (locked) {
        add(locked, resolved.trusted.has(locked));
        continue;
      }
      if (projectSkills && (await readTextIfExists(path.join(projectSkills, t, SKILL_FILE))) !== null) {
        add(path.join(projectSkills, t), false);
        continue;
      }
      unknown.push(t);
    }
    if (unknown.length) {
      throw new UsageError(`${unknown.length === 1 ? 'Skill' : 'Skills'} not found: ${unknown.join(', ')}`, [
        'Pass a skill directory (or a directory of skills), or a name with --catalog <dir>.',
      ]);
    }
  } catch (err) {
    await removeAll(resolved.temp);
    throw err;
  }
  return resolved;
}

async function removeAll(dirs: string[]): Promise<void> {
  for (const d of dirs.splice(0)) await fs.promises.rm(d, { recursive: true, force: true });
}

/** An official catalog skill: its sidecar names the package `@agileflow/<dir>`. */
async function isOfficial(dir: string): Promise<boolean> {
  const text = await readTextIfExists(path.join(dir, SIDECAR_FILE));
  if (text === null) return false;
  try {
    return parseSidecar(text).package.name === `@agileflow/${path.basename(dir)}`;
  } catch {
    return false;
  }
}

function printLint(cli: Cli, results: LintResult[]): void {
  const { out } = cli;
  out.lines(
    table(
      ['SKILL', 'LINES', 'EVALS', 'NEGATIVE', 'RESULT'],
      results.map((r) => [r.skill, String(r.lines), String(r.scenarios), String(r.negatives), r.passed ? 'pass' : 'FAIL']),
    ),
  );
  for (const r of results) {
    const shown = r.issues.filter((i) => i.level !== 'info');
    if (!shown.length) continue;
    out.line();
    out.line(`${r.skill}:`);
    for (const i of shown) out.line(`  ${i.level === 'error' ? '[x]' : '[!]'} ${i.message}`);
  }
}

const pct = (v: number | null | undefined) => (v === null || v === undefined ? 'n/a' : `${(v * 100).toFixed(0)}%`);
const ci = (i: Interval | null) => (i ? ` (95% CI ${pct(i.low)}-${pct(i.high)})` : '');

function printComparison(cli: Cli, rows: PreferenceComparison[]): void {
  if (!rows.length) return;
  const rate = (v: number | undefined) => (v === undefined ? '-' : `${(v * 100).toFixed(0)}%`);
  cli.out.heading('Question preferences compared (asked user)');
  cli.out.lines(
    table(
      ['SCENARIO', 'AMBIGUITY', 'PREFER', 'DEFAULT', 'MINIMIZE', 'ORDER'],
      rows.map((r) => [
        `${r.skill}/${r.scenario}`,
        r.ambiguity,
        rate(r.askedRate.prefer),
        rate(r.askedRate['provider-default']),
        rate(r.askedRate.minimize),
        r.ordered === null ? 'n/a' : r.ordered ? 'ok' : 'FAIL',
      ]),
    ),
  );
}

const MARKS: Record<ScenarioResult['status'], string> = { passed: '[ok]', failed: '[x]', inconclusive: '[inc]', 'not-run': '[-]' };

const kinds = (counts: Partial<Record<string, number>>) =>
  Object.entries(counts)
    .map(([k, n]) => `${k} ${n}`)
    .join(', ');

/** What an errored run still observed, so an infrastructure error is not mistaken for "did nothing". */
function printEvidence(cli: Cli, run: RunResult): void {
  const { out } = cli;
  const facts: string[] = [];
  if (run.transcript.exitCode !== null || run.transcript.raw) {
    const source = run.provenance.source ? ` (loaded from ${run.provenance.source === 'sandbox' ? 'the sandbox' : run.provenance.source === 'outside' ? 'OUTSIDE the sandbox' : 'an unverified location'})` : '';
    facts.push(`activated ${run.activated ? 'yes' : 'no'}${source}`);
  }
  if (run.rubric) {
    const rules = run.rubric.items.filter((i) => i.source === 'rule');
    facts.push(`rule checks ${rules.filter((i) => i.pass).length}/${rules.length} passed`);
    if (run.rubric.ungraded.length) facts.push(`${run.rubric.ungraded.length} judge criteria ungraded`);
  }
  if (facts.length) out.line(`       observed: ${facts.join('; ')}`);
  if (run.judgeReply) out.line(`       judge reply: ${run.judgeReply.replace(/\s+/g, ' ').slice(0, 300)}`);
  if (run.transcriptFile) out.line(`       transcript: ${run.transcriptFile}`);
}

function printScenario(cli: Cli, r: ScenarioResult): void {
  const { out } = cli;
  const observed = r.runs.filter((x) => x.activationObserved);
  const scored = r.runs.filter((x) => x.status === 'ok');
  const activated = observed.filter((x) => x.activated).length;
  const rubric = r.rubricScore === null ? '' : `  rubric ${pct(r.rubricScore)}`;
  const asked = scored.filter((x) => x.askedUser).length;
  const pass = r.passRate.runs ? `  pass ${r.passRate.passed}/${r.passRate.runs}${ci(r.passRate.ci95)}` : '';
  const expected = `expected ${r.expected ? 'yes' : 'no'}${r.invocation === 'explicit' ? ', explicit' : ''}`;
  out.line(
    `  ${MARKS[r.status]} ${r.skill}/${r.scenario}  activated ${activated}/${observed.length} (${expected})${pass}  asked user ${asked}/${scored.length}${rubric}`,
  );
  if (r.interaction) {
    const i = r.interaction;
    const expect = i.expectation ? `expected ${i.expectation}` : i.ambiguity === 'choice' ? 'compared across preferences' : 'no expectation';
    const judged = i.judged
      ? `; unwarranted questions ${i.unwarranted}, assumptions ${i.proceededWithAssumption} (${i.unreasonableAssumptions} unreasonable), succeeded ${i.succeeded}/${i.completed} finished`
      : '';
    out.line(`       ${i.ambiguity}: ${expect}; structured ${i.structured}/${i.runs}${judged}`);
  }
  for (const run of r.runs) {
    if (run.status === 'ok') for (const item of run.rubric?.items ?? []) if (!item.pass) out.line(`       rubric (${item.source}) failed: ${item.criterion}: ${item.reason}`);
    for (const v of run.violations) out.line(`       forbidden ${v.kind} (${v.rule}): ${v.evidence}`);
    if (run.otherActivations.length) out.line(`       also activated: ${run.otherActivations.join(', ')}`);
    if (run.error) {
      out.line(`       ${run.error.kind === 'ungraded' ? 'inconclusive' : 'error'} (${run.error.kind}): ${run.error.message}`);
      printEvidence(cli, run);
    }
  }
  // Scenario-level errors without a run (an invalid scenario file).
  if (!r.runs.length) for (const e of r.errors) out.line(`       error: ${e}`);
}

function printEvalReport(cli: Cli, report: EvalReport): void {
  const { out } = cli;
  const env = report.environment;
  const flags = [report.mode, report.isolated ? 'isolated' : 'not isolated'];
  if (report.questionPreference) flags.push(`questionPreference: ${report.questionPreference}`);
  if (report.judge) flags.push(`judge: ${report.judge}`);
  out.heading(`${report.provider}${env.providerVersion ? ` ${env.providerVersion}` : ''} (${flags.join(', ')})`);
  const ran = report.results.filter((r) => r.status !== 'not-run' || r.notRun !== 'filtered');
  const standard = ran.filter((r) => r.kind !== 'adversarial');
  const adversarial = ran.filter((r) => r.kind === 'adversarial');
  for (const r of standard) printScenario(cli, r);
  if (adversarial.length) {
    out.line('  Adversarial:');
    for (const r of adversarial) printScenario(cli, r);
  }
  const foreign = [...new Set(report.results.flatMap((r) => r.runs.flatMap((x) => x.foreignSkills)))];
  if (foreign.length && !report.isolated) {
    out.line(`  [!] the provider also saw your personal skills (${foreign.join(', ')}); activation results may be skewed`);
  }
  out.line();
  out.lines(
    table(
      ['SKILL', 'PASSED', 'FAILED', 'INCONCLUSIVE', 'PRECISION', 'RECALL', 'F1', 'EXPLICIT', 'TASK'],
      report.skills.map((s) => [
        s.skill,
        String(s.passed),
        String(s.failed),
        String(s.inconclusive),
        pct(s.activation.precision),
        pct(s.activation.recall),
        pct(s.activation.f1),
        s.explicit.runs ? `${s.explicit.loaded}/${s.explicit.runs}` : '-',
        s.taskCompletion.runs ? `${s.taskCompletion.met}/${s.taskCompletion.runs}` : '-',
      ]),
      '  ',
    ),
  );
  const s = report.summary;
  const inconclusive = s.inconclusive ? `, ${s.inconclusive} inconclusive (${kinds(s.errorKinds)})` : '';
  const notRun = s.notRun ? `, ${s.notRun} not run` : '';
  const adv = s.adversarial.scenarios ? `; adversarial ${s.adversarial.passed}/${s.adversarial.scenarios} passed` : '';
  out.line(`  ${s.passed}/${s.scenarios - s.notRun} scenarios passed, ${s.failed} failed${inconclusive}${notRun}${adv}`);
  const explicit = s.explicit.runs ? `; explicit invocation ${s.explicit.loaded}/${s.explicit.runs}` : '';
  const task =
    report.mode === 'full'
      ? `; task completion ${s.taskCompletion.runs ? `${s.taskCompletion.met}/${s.taskCompletion.runs} (${pct(s.taskCompletion.rate)})` : 'n/a'}`
      : '';
  out.line(`  implicit activation precision ${pct(s.precision)}, recall ${pct(s.recall)}, F1 ${pct(s.f1)}${explicit}${task}`);
  if (report.mode === 'activation' && report.results.some((r) => r.expected && r.status !== 'not-run')) {
    out.line('  rubrics and task completion are not measured in activation mode (use --mode full)');
  }
  const p = s.provenance;
  if (p.unverified) out.line(`  [!] skill source unverified for ${p.unverified} activated run(s): ${report.provider} did not say which SKILL.md it loaded`);
  if (p.visibilityUnchecked) out.line(`  [!] personal-skill leak check not available: ${report.provider} does not report the skills it sees`);
  if (env.auth) out.line(`  auth: ${env.auth.mode}${env.auth.envVars.length ? ` (${env.auth.envVars.join(', ')})` : ''}`);
  out.line();
}

function printProviderComparison(cli: Cli, reports: EvalReport[]): void {
  const comparison = compareProviders(reports);
  if (!comparison) return;
  const label: Record<string, string> = { passed: 'ok', failed: 'FAIL', inconclusive: 'INC' };
  const cell = (v: { status: string; passRate: number | null } | null) => (v === null ? '-' : `${label[v.status] ?? v.status} ${pct(v.passRate)}`);
  cli.out.heading('Providers compared');
  const rows = comparison.scenarios.map((row) => [
    `${row.kind === 'adversarial' ? '(adv) ' : ''}${row.skill}/${row.scenario}`,
    ...comparison.columns.map((c) => cell(row.results[c] ?? null)),
  ]);
  const summary = (label: string, pick: (c: string) => string) => [label, ...comparison.columns.map(pick)];
  rows.push(
    summary('PRECISION', (c) => pct(comparison.summary[c]!.precision)),
    summary('RECALL', (c) => pct(comparison.summary[c]!.recall)),
    summary('F1', (c) => pct(comparison.summary[c]!.f1)),
    summary('PASSED', (c) => `${comparison.summary[c]!.passed}/${comparison.summary[c]!.passed + comparison.summary[c]!.failed + comparison.summary[c]!.inconclusive}`),
  );
  cli.out.lines(table(['SCENARIO', ...comparison.columns.map((c) => c.toUpperCase())], rows));
}

/** Everything reported so far, so an interrupted or failed eval still leaves a (partial) report. */
interface EvalSession {
  lint: LintResult[];
  reports: EvalReport[];
  /** The provider/preference run in progress (scenarios finished so far). */
  current: EvalReport | null;
  comparisons: Array<PreferenceComparison & { provider: string }>;
  /** Finished skill and pack comparisons, and the one in progress (tasks finished so far). */
  skillComparisons: Array<SkillComparison | PackComparison>;
  pendingComparison: SkillComparison | PackComparison | null;
  packActivation: PackActivationReport[];
  preflight: PreflightIssue[];
  /** Provider runs have started (a partial report is worth writing). */
  started: boolean;
  /** Set once an abort begins: runs still unwinding must not overwrite its report. */
  aborted: boolean;
  outPath: string | null;
}

function sessionReport(session: EvalSession, exitCode: number, complete: boolean, interrupted: string | null = null) {
  return buildJsonReport({
    lint: session.lint,
    reports: session.current ? [...session.reports, session.current] : session.reports,
    preferenceComparisons: session.comparisons,
    exitCode,
    complete,
    interrupted,
    preflight: session.preflight,
    agileflowVersion: cliVersion(),
    comparisons: session.pendingComparison ? [...session.skillComparisons, session.pendingComparison] : session.skillComparisons,
    packActivation: session.packActivation,
  });
}

async function writeOut(session: EvalSession, report: ReturnType<typeof buildJsonReport>, options: { abort?: boolean } = {}): Promise<void> {
  if (session.aborted && !options.abort) return;
  if (session.outPath) await writeFileAtomic(session.outPath, JSON.stringify(report, null, 2) + '\n');
}

/**
 * On SIGINT/SIGTERM or an uncaught failure: stop provider runs, write refreshed
 * logins back and delete isolated HOMEs and sandboxes, write the partial
 * report, then exit (130/143, or 1). A second signal exits immediately.
 */
function installAbortHandlers(cli: Cli, session: EvalSession, options: EvalOptions, temp: string[]): () => void {
  let aborting = false;
  const abort = (reason: string, code: number) => {
    if (aborting) {
      // A second signal: no time for the orderly cleanup, but never leave login copies behind.
      disposeActiveSync();
      for (const dir of temp) fs.rmSync(dir, { recursive: true, force: true });
      process.exit(code);
    }
    aborting = true;
    session.aborted = true;
    cli.out.stderr.write(`\n${reason}: stopping provider runs, removing sandboxes and isolated HOMEs...\n`);
    void (async () => {
      try {
        await disposeActive();
        await removeAll(temp);
        const report = sessionReport(session, EXIT.ERROR, false, reason);
        if (session.started) await writeOut(session, report, { abort: true }).catch(() => undefined);
        if (options.json) cli.out.json(report);
        if (session.outPath && session.started) cli.out.stderr.write(`partial report written to ${session.outPath}\n`);
      } finally {
        process.exit(code);
      }
    })();
  };
  const onSigint = () => abort('interrupted (SIGINT)', 130);
  const onSigterm = () => abort('terminated (SIGTERM)', 143);
  const onCrash = (err: unknown) => {
    cli.out.stderr.write(`unexpected failure: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
    abort('failed', EXIT.ERROR);
  };
  process.on('SIGINT', onSigint);
  process.on('SIGTERM', onSigterm);
  process.on('uncaughtException', onCrash);
  return () => {
    process.off('SIGINT', onSigint);
    process.off('SIGTERM', onSigterm);
    process.off('uncaughtException', onCrash);
  };
}

export async function runEval(cli: Cli, targets: string[], options: EvalOptions): Promise<number> {
  // Validate every flag before doing any work.
  if (options.lint && options.provider) throw new UsageError('--lint runs structural checks only; drop --provider, or drop --lint to run evals');
  const runs = parsePositiveInt('--runs', options.runs);
  const passRate = parseFraction('--pass-rate', options.passRate);
  const rubricThreshold = parseFraction('--rubric-threshold', options.rubricThreshold, { allowZero: true });
  const timeout = parseSeconds('--timeout', options.timeout);
  if (options.judge && options.judge !== 'claude' && options.judge !== 'none') throw new UsageError('--judge must be claude or none');
  if (options.mode && options.mode !== 'full' && options.mode !== 'activation') throw new UsageError('--mode must be activation or full');
  const PREFERENCES: InteractionPreference[] = ['provider-default', 'prefer', 'minimize'];
  if (options.questionPreference && options.questionPreference !== 'all' && !PREFERENCES.includes(options.questionPreference as InteractionPreference)) {
    throw new UsageError('--question-preference must be provider-default, prefer, minimize, or all');
  }
  const providers = splitList(options.provider);
  for (const id of providers) {
    if (!DRIVERS[id]) throw new UsageError(`Unknown eval provider "${id}" (known: ${Object.keys(DRIVERS).join(', ')})`);
  }
  const comparing = options.compare !== undefined && options.compare !== false;
  const seed = parseSeed(options.seed);
  const arms = comparing ? parseArms(options, targets) : [];
  if ((comparing || options.pack) && (options.lint || !providers.length)) {
    throw new UsageError(`${comparing ? '--compare' : '--pack'} runs a provider: pass --provider and drop --lint`);
  }
  if (options.released && (!comparing || options.pack)) throw new UsageError('--released only applies to --compare of a skill');
  if ((comparing || options.pack) && options.questionPreference === 'all') throw new UsageError('--question-preference all cannot be combined with --compare or --pack');
  if (options.pack && options.mode === 'full') throw new UsageError('--pack measures activation across the pack; drop --mode full');

  // With --pack and no skill arguments, the pack is the subject; do not fall back to the project's skills.
  resetAbort();
  const resolved: ResolvedSkills =
    options.pack && !targets.length ? { dirs: [], trusted: new Set(), temp: [] } : await resolveSkillDirs(cli, targets, options.catalog);
  const session: EvalSession = {
    lint: [],
    reports: [],
    current: null,
    comparisons: [],
    skillComparisons: [],
    pendingComparison: null,
    packActivation: [],
    preflight: [],
    started: false,
    aborted: false,
    outPath: options.out ? path.resolve(cli.ctx.cwd, options.out) : null,
  };
  const uninstall = installAbortHandlers(cli, session, options, resolved.temp);
  try {
    const parsed = { runs, passRate, rubricThreshold, timeout, providers, PREFERENCES };
    if (comparing || options.pack) return await evaluateComparison(cli, resolved, options, { ...parsed, arms, seed }, session);
    return await evaluate(cli, resolved, options, parsed, session);
  } catch (err) {
    // Release everything still held and keep what was measured.
    await disposeActive();
    if (session.started) await writeOut(session, sessionReport(session, EXIT.ERROR, false, `error: ${(err as Error).message}`)).catch(() => undefined);
    throw err;
  } finally {
    // An abort in progress owns the exit: its cleanup, report, and exit code win.
    if (session.aborted) await new Promise<never>(() => {});
    uninstall();
    await removeAll(resolved.temp);
  }
}

async function evaluate(
  cli: Cli,
  resolved: ResolvedSkills,
  options: EvalOptions,
  parsed: {
    runs?: number;
    passRate?: number;
    rubricThreshold?: number;
    timeout?: number;
    providers: string[];
    PREFERENCES: InteractionPreference[];
  },
  session: EvalSession,
): Promise<number> {
  const { dirs } = resolved;
  if (!dirs.length) throw new UsageError('No skills with evals found');
  const catalogDirs = options.catalog ? await listCatalog(path.resolve(cli.ctx.cwd, options.catalog)) : dirs;
  let fixturesDir = options.fixtures ? path.resolve(cli.ctx.cwd, options.fixtures) : undefined;
  if (fixturesDir && !(await pathExists(fixturesDir))) throw new UsageError(`--fixtures ${options.fixtures}: directory not found`);
  if (!fixturesDir && options.catalog) {
    const guess = path.resolve(cli.ctx.cwd, options.catalog, '..', 'fixtures');
    if (await pathExists(guess)) fixturesDir = guess;
  }

  const catalog = await catalogSkills([...new Set([...catalogDirs, ...dirs])]);
  const lint = session.lint;
  for (const dir of dirs) lint.push(await lintSkill(dir, { official: await isOfficial(dir), catalog, fixturesDir }));
  const lintPassed = lint.every((r) => r.passed);

  if (options.lint || !parsed.providers.length) {
    const exitCode = lintPassed ? EXIT.OK : EXIT.ERROR;
    const report = sessionReport(session, exitCode, true);
    if (options.json) cli.out.json(report);
    else {
      printLint(cli, lint);
      if (!options.lint) {
        cli.out.line();
        cli.out.line('Structural checks only. Run behavioral evals against a real provider with:');
        cli.out.line('  agileflow eval <skills> --provider claude|codex|gemini|opencode [--mode full]');
      }
    }
    await writeOut(session, report);
    return exitCode;
  }

  const preferences: Array<InteractionPreference | undefined> =
    options.questionPreference === 'all' ? parsed.PREFERENCES : [options.questionPreference as InteractionPreference | undefined];
  const mode = options.mode === 'full' ? 'full' : 'activation';
  const isolate = options.isolate !== false;
  const useJudge = mode === 'full' && options.judge !== 'none';
  const setupAllowed = options.allowSetup ? () => true : (dir: string) => resolved.trusted.has(dir);
  const filter = options.scenario?.length ? (sc: { name: string }) => options.scenario!.includes(sc.name) : undefined;

  // Preflight: find everything that would fail for reasons other than the
  // skill before any (paid) provider run starts.
  const issues = session.preflight;
  for (const id of parsed.providers) {
    const driver = DRIVERS[id]!;
    if (!(await driver.available(cli.ctx.env))) issues.push({ subject: id, message: `${driver.displayName} (\`${driver.executable}\`) is not installed or not on PATH` });
  }
  if (useJudge && !parsed.providers.includes('claude') && (await findExecutable('claude', cli.ctx.env, process.platform)) === null) {
    issues.push({ subject: '--judge claude', message: 'the Claude judge needs `claude` on PATH (or pass --judge none: judge criteria are then inconclusive)' });
  }
  issues.push(
    ...(await preflight({ skillDirs: dirs, fixturesDir, filter, scenarioNames: options.scenario, setupAllowed, env: cli.ctx.env })),
  );
  if (issues.length) {
    // Every scenario is reported as not run, so the outcome of each is explicit.
    for (const id of parsed.providers) {
      for (const questionPreference of preferences) {
        session.reports.push(
          await notRunReport({ skillDirs: dirs, driver: DRIVERS[id]!, mode, questionPreference, isolate, model: options.model, filter }, 'preflight'),
        );
      }
    }
    const report = sessionReport(session, EXIT.ERROR, true);
    if (options.json) cli.out.json(report);
    else {
      cli.out.error(
        `preflight found ${issues.length} problem${issues.length === 1 ? '' : 's'}; no provider run was started`,
        issues.map((i) => `[x] ${i.subject}: ${i.message}`),
      );
    }
    await writeOut(session, report);
    return EXIT.ERROR;
  }

  // The judge never inherits --model: that names the model under test, possibly another vendor's.
  const judge = useJudge ? claudeJudge({ env: cli.ctx.env, model: options.judgeModel, isolate }) : null;
  // Raw provider transcripts go next to the report, which points at them.
  const transcriptDir = session.outPath ? `${session.outPath.replace(/\.json$/i, '')}.transcripts` : undefined;

  const reports = session.reports;
  const comparisons = session.comparisons;
  session.started = true;
  await writeOut(session, sessionReport(session, EXIT.ERROR, false));
  for (const id of parsed.providers) {
    const driver = DRIVERS[id]!;
    for (const questionPreference of preferences) {
      const report = await runEvals({
        skillDirs: dirs,
        catalogDirs,
        driver,
        judge,
        runs: parsed.runs ?? 1,
        mode,
        fixturesDir,
        model: options.model,
        env: cli.ctx.env,
        keep: options.keep,
        passRate: parsed.passRate,
        rubricThreshold: parsed.rubricThreshold,
        timeoutMs: parsed.timeout !== undefined ? Math.round(parsed.timeout * 1000) : undefined,
        questionPreference,
        isolate,
        setupAllowed,
        filter,
        transcriptDir,
        onProgress: options.json ? undefined : (m) => cli.out.stderr.write(`${m}${questionPreference ? ` [${questionPreference}]` : ''}\n`),
        // Rewrite --out after every scenario so an abort still leaves the results so far.
        onScenario: async (partial) => {
          session.current = partial;
          await writeOut(session, sessionReport(session, EXIT.ERROR, false));
        },
      });
      session.current = null;
      reports.push(report);
      if (!options.json) printEvalReport(cli, report);
    }
    if (preferences.length > 1) {
      const rows = compareQuestionPreferences(reports.filter((r) => r.provider === driver.id));
      comparisons.push(...rows.map((r) => ({ provider: driver.id, ...r })));
      if (!options.json) printComparison(cli, rows);
    }
  }
  if (!options.json) printProviderComparison(cli, reports);

  const passed =
    lintPassed &&
    reports.every((r) => r.summary.failed === 0 && r.summary.inconclusive === 0) &&
    comparisons.every((c) => c.ordered !== false);
  const exitCode = passed ? EXIT.OK : EXIT.ERROR;
  const report = sessionReport(session, exitCode, true);
  if (options.json) cli.out.json(report);
  await writeOut(session, report);
  return exitCode;
}

// ---------------------------------------------------------------------------
// Comparisons (--compare) and pack activation (--pack)
// ---------------------------------------------------------------------------

const ARMS = ['baseline', 'released', 'candidate'];

export function parseSeed(value: string | undefined): number {
  if (value === undefined) return Math.floor(Math.random() * 2 ** 31);
  if (!/^\d+$/.test(value.trim())) throw new UsageError(`--seed must be a whole number (got "${value}")`);
  return Number(value);
}

/** Arms to run: a skill comparison's subset of baseline, released, candidate, or a pack's without/with. */
export function parseArms(options: EvalOptions, targets: string[]): string[] {
  if (options.pack) {
    if (typeof options.compare === 'string') throw new UsageError('--pack --compare compares the pack without and with the skills you name; it takes no arm list');
    if (!targets.length) throw new UsageError('--pack --compare needs the skills to add', ['e.g. agileflow eval ./skills/new-skill --pack core --compare --provider claude']);
    return ['without', 'with'];
  }
  if (!targets.length) throw new UsageError('--compare needs the candidate skill', ['e.g. agileflow eval ./skills/my-skill --compare --provider claude --mode full']);
  const full = options.mode === 'full';
  const list = typeof options.compare === 'string' ? splitList(options.compare) : full ? ARMS : ['released', 'candidate'];
  for (const arm of list) {
    if (!ARMS.includes(arm)) throw new UsageError(`Unknown --compare arm "${arm}" (known: ${ARMS.join(', ')}; put skill arguments before --compare)`);
  }
  if (new Set(list).size < 2) throw new UsageError('--compare needs at least two arms');
  if (list.includes('baseline') && !full) {
    throw new UsageError('the baseline arm (skill not installed) is compared on task completion: add --mode full');
  }
  return ARMS.filter((a) => list.includes(a));
}

/** The default registry is the official one only when neither AGILEFLOW_REGISTRY nor the project config points elsewhere. */
async function officialRegistry(cli: Cli, projectRoot: string | null): Promise<boolean> {
  if (cli.ctx.env.AGILEFLOW_REGISTRY) return false;
  if (!projectRoot) return true;
  return !(await readProjectConfig(projectScope(projectRoot).configPath).catch(() => null))?.registry;
}

async function registryServices(cli: Cli) {
  const projectRoot = await findProjectRoot(cli.ctx.cwd, { homeDir: cli.ctx.homeDir });
  return { projectRoot, services: await servicesFor(cli.ctx, projectRoot ? projectScope(projectRoot) : globalScope(cli.ctx)) };
}

/** Write fetched package files as `<temp>/<id>`, so the installed skill keeps its id. */
async function packageDir(resolved: ResolvedSkills, id: string, write: (dir: string) => Promise<void>): Promise<string> {
  const temp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agileflow-eval-pkg-'));
  resolved.temp.push(temp);
  const dir = path.join(temp, id);
  await write(dir);
  return dir;
}

/**
 * The released copy of `id` to compare against: `--released <dir>` (the
 * directory, or `<dir>/<id>`), `--released <version>` from the registry, else
 * the version this project locks, else the latest published version.
 */
async function resolveReleased(cli: Cli, id: string, spec: string | undefined, resolved: ResolvedSkills): Promise<{ dir: string } | { problem: string }> {
  try {
    if (spec && (await pathExists(path.resolve(cli.ctx.cwd, spec)))) {
      const root = path.resolve(cli.ctx.cwd, spec);
      const src = (await readTextIfExists(path.join(root, id, SKILL_FILE))) !== null ? path.join(root, id) : (await readTextIfExists(path.join(root, SKILL_FILE))) !== null ? root : null;
      if (!src) return { problem: `--released ${spec} holds neither ${SKILL_FILE} nor ${id}/${SKILL_FILE}` };
      return { dir: await packageDir(resolved, id, (dir) => copyTree(src, dir)) };
    }
    const { projectRoot, services } = await registryServices(cli);
    if (!spec && projectRoot) {
      const locked = await lockedPackageDir(cli, projectRoot, id, resolved);
      if (locked) return { dir: locked };
    }
    const pkg = await services.fetcher.resolve(id, { source: `@agileflow/${id}`, ...(spec ? { version: spec } : {}) }, cli.ctx.cwd);
    return { dir: await packageDir(resolved, id, (dir) => writeTree(dir, pkg.files)) };
  } catch (err) {
    return { problem: `the released version of ${id} could not be loaded: ${(err as Error).message}` };
  }
}

/** Skill directories of a pack: `installed` (this project's skills), or a pack from `<catalog>/../packs` or the registry. */
async function resolvePack(cli: Cli, name: string, catalog: string | undefined, resolved: ResolvedSkills): Promise<{ name: string; dirs: string[] }> {
  if (name === 'installed') {
    const locked = await resolveSkillDirs(cli, [], undefined);
    resolved.temp.push(...locked.temp);
    for (const d of locked.trusted) resolved.trusted.add(d);
    return { name, dirs: locked.dirs };
  }
  const { projectRoot, services } = await registryServices(cli);
  const catalogDir = catalog ? path.resolve(cli.ctx.cwd, catalog) : null;
  const short = name.replace(/^@agileflow\//, '');
  const localFile = catalogDir ? path.join(catalogDir, '..', 'packs', `${short}.yaml`) : null;
  const localText = localFile ? await readTextIfExists(localFile) : null;
  const pack = localText !== null ? parsePack(localText, localFile!) : await services.fetcher.getPack(name.includes('/') ? name : `@agileflow/${name}`).catch(() => null);
  if (!pack) throw new UsageError(`Pack "${name}" not found`, ['Use a registry pack name (e.g. core), or installed for this project\'s skills.']);
  const official = await officialRegistry(cli, projectRoot);
  const dirs: string[] = [];
  for (const member of packMembers(pack)) {
    if (catalogDir && (await readTextIfExists(path.join(catalogDir, member.id, SKILL_FILE))) !== null) {
      dirs.push(path.join(catalogDir, member.id));
      continue;
    }
    const pkg = await services.fetcher.resolve(member.id, { source: member.source, ...(member.range ? { version: member.range } : {}) }, cli.ctx.cwd);
    const dir = await packageDir(resolved, member.id, (d) => writeTree(d, pkg.files));
    if (official) resolved.trusted.add(dir);
    dirs.push(dir);
  }
  return { name: pack.name, dirs };
}

async function evaluateComparison(
  cli: Cli,
  resolved: ResolvedSkills,
  options: EvalOptions,
  parsed: { runs?: number; passRate?: number; rubricThreshold?: number; timeout?: number; providers: string[]; arms: string[]; seed: number },
  session: EvalSession,
): Promise<number> {
  const { dirs } = resolved;
  const comparing = parsed.arms.length > 0;
  let fixturesDir = options.fixtures ? path.resolve(cli.ctx.cwd, options.fixtures) : undefined;
  if (fixturesDir && !(await pathExists(fixturesDir))) throw new UsageError(`--fixtures ${options.fixtures}: directory not found`);
  if (!fixturesDir && options.catalog) {
    const guess = path.resolve(cli.ctx.cwd, options.catalog, '..', 'fixtures');
    if (await pathExists(guess)) fixturesDir = guess;
  }
  const pack = options.pack ? await resolvePack(cli, options.pack, options.catalog, resolved) : null;
  const catalogDirs = options.catalog ? await listCatalog(path.resolve(cli.ctx.cwd, options.catalog)) : [];
  if (!dirs.length && !pack?.dirs.length) throw new UsageError('No skills with evals found');
  // The skills you pass are linted; pack members are published packages, measured, not authored here.
  const catalog = await catalogSkills([...new Set([...catalogDirs, ...(pack?.dirs ?? []), ...dirs])]);
  for (const dir of dirs) session.lint.push(await lintSkill(dir, { official: await isOfficial(dir), catalog, fixturesDir }));
  const lintPassed = session.lint.every((r) => r.passed);

  const mode = !pack && options.mode === 'full' ? 'full' : 'activation';
  const isolate = options.isolate !== false;
  const useJudge = mode === 'full' && options.judge !== 'none';
  const setupAllowed = options.allowSetup ? () => true : (dir: string) => resolved.trusted.has(dir);
  const filter = options.scenario?.length ? (sc: { name: string }) => options.scenario!.includes(sc.name) : undefined;
  const scenarioDirs = pack ? [...pack.dirs, ...dirs] : dirs;

  // Preflight, including the released copies: an arm that cannot run fails before any provider run.
  const issues = session.preflight;
  for (const id of parsed.providers) {
    const driver = DRIVERS[id]!;
    if (!(await driver.available(cli.ctx.env))) issues.push({ subject: id, message: `${driver.displayName} (\`${driver.executable}\`) is not installed or not on PATH` });
  }
  if (useJudge && !parsed.providers.includes('claude') && (await findExecutable('claude', cli.ctx.env, process.platform)) === null) {
    issues.push({ subject: '--judge claude', message: 'the Claude judge needs `claude` on PATH (or pass --judge none: judge criteria are then inconclusive)' });
  }
  const released = new Map<string, string>();
  if (!pack && parsed.arms.includes('released')) {
    for (const dir of dirs) {
      const id = path.basename(dir);
      const res = await resolveReleased(cli, id, options.released, resolved);
      if ('dir' in res) released.set(id, res.dir);
      else issues.push({ subject: `${id} (released)`, message: res.problem });
    }
  }
  issues.push(
    ...(await preflight({ skillDirs: scenarioDirs, fixturesDir, filter, scenarioNames: options.scenario, setupAllowed, env: cli.ctx.env, includeHeldOut: true })),
  );
  if (issues.length) {
    const report = sessionReport(session, EXIT.ERROR, true);
    if (options.json) cli.out.json(report);
    else cli.out.error(`preflight found ${issues.length} problem${issues.length === 1 ? '' : 's'}; no provider run was started`, issues.map((i) => `[x] ${i.subject}: ${i.message}`));
    await writeOut(session, report);
    return EXIT.ERROR;
  }

  const judge = useJudge ? claudeJudge({ env: cli.ctx.env, model: options.judgeModel, isolate }) : null;
  const transcriptDir = session.outPath ? `${session.outPath.replace(/\.json$/i, '')}.transcripts` : undefined;
  const runs = parsed.runs ?? 1;
  const scenariosOf = async (dir: string) => (await loadScenarios(dir)).scenarios.filter((sc) => !filter || filter(sc));
  session.started = true;
  await writeOut(session, sessionReport(session, EXIT.ERROR, false));

  for (const providerId of parsed.providers) {
    const driver = DRIVERS[providerId]!;
    const common = {
      driver,
      judge,
      runs,
      mode,
      fixturesDir,
      model: options.model,
      env: cli.ctx.env,
      keep: options.keep,
      passRate: parsed.passRate,
      rubricThreshold: parsed.rubricThreshold,
      timeoutMs: parsed.timeout !== undefined ? Math.round(parsed.timeout * 1000) : undefined,
      questionPreference: options.questionPreference as InteractionPreference | undefined,
      isolate,
      setupAllowed,
      onProgress: options.json ? undefined : (m: string) => cli.out.stderr.write(`${m}\n`),
    } as const;
    const partialWrite = async () => writeOut(session, sessionReport(session, EXIT.ERROR, false));

    if (pack && !comparing) {
      const all = [...pack.dirs, ...dirs];
      const report = await runEvals({
        ...common,
        skillDirs: all,
        catalogDirs: all,
        includeHeldOut: true,
        filter,
        transcriptDir: transcriptDir && path.join(transcriptDir, providerId),
        onScenario: async (partial) => {
          session.current = partial;
          await partialWrite();
        },
      });
      session.current = null;
      session.reports.push(report);
      const ids = all.map((d) => path.basename(d));
      const act = { pack: pack.name, provider: providerId, authoring: packActivation(report, ids, (r) => !r.heldOut), heldOut: packActivation(report, ids, (r) => r.heldOut) };
      session.packActivation.push(act);
      if (!options.json) {
        printEvalReport(cli, report);
        printPackActivation(cli, `Pack ${pack.name} activation (${providerId})`, act.authoring);
        if (act.heldOut.runs || act.heldOut.erroredRuns) printPackActivation(cli, 'Held-out requests', act.heldOut);
      }
      continue;
    }

    if (pack) {
      const existing = pack.dirs.map((d) => path.basename(d));
      const passed = new Map(dirs.map((d) => [path.basename(d), d]));
      const added = [...passed.keys()].filter((id) => !existing.includes(id));
      // A passed skill that is already a member replaces that member in the `with` arm (a new version inside the pack).
      const replaced = [...passed.keys()].filter((id) => existing.includes(id));
      const arms: ArmSpec[] = [
        { id: 'without', catalogDirs: pack.dirs },
        { id: 'with', catalogDirs: [...pack.dirs.map((d) => passed.get(path.basename(d)) ?? d), ...added.map((id) => passed.get(id)!)] },
      ];
      const tasks: ArmTask[] = [];
      // Existing skills are judged on the same requests in both arms; a replaced member's are the new copy's scenarios.
      for (const dir of pack.dirs) {
        const source = passed.get(path.basename(dir)) ?? dir;
        for (const scenario of await scenariosOf(source)) tasks.push({ scenario, skillDir: source, arms: ['without', 'with'] });
      }
      for (const id of added) for (const scenario of await scenariosOf(passed.get(id)!)) tasks.push({ scenario, skillDir: passed.get(id)!, arms: ['with'] });
      const input = { provider: providerId, pack: pack.name, existing, added, replaced, seed: parsed.seed, runs, arms };
      const reports = await runArms({
        ...common,
        arms,
        tasks,
        seed: parsed.seed,
        transcriptDir: transcriptDir && path.join(transcriptDir, providerId),
        onTask: async (partial) => {
          session.pendingComparison = comparePackArms({ ...input, reports: partial });
          await partialWrite();
        },
      });
      const result = comparePackArms({ ...input, reports });
      session.pendingComparison = null;
      session.skillComparisons.push(result);
      if (!options.json) printPackComparison(cli, result);
      continue;
    }

    for (const dir of dirs) {
      const id = path.basename(dir);
      // Every arm has the rest of --catalog installed; only the skill under test differs.
      const others = catalogDirs.filter((d) => path.basename(d) !== id);
      const arms: ArmSpec[] = parsed.arms.map((arm) => ({
        id: arm,
        catalogDirs: arm === 'baseline' ? others : arm === 'released' ? [...others, released.get(id)!] : [...others, dir],
      }));
      const tasks: ArmTask[] = (await scenariosOf(dir)).map((scenario) => ({ scenario, skillDir: dir, arms: parsed.arms }));
      const input = { provider: providerId, skill: id, seed: parsed.seed, runs, mode, arms } as const;
      let done = 0;
      const reports = await runArms({
        ...common,
        arms,
        tasks,
        seed: parsed.seed,
        transcriptDir: transcriptDir && path.join(transcriptDir, providerId, id),
        onTask: async (partial) => {
          done++;
          session.pendingComparison = compareSkillArms({ ...input, tasks: tasks.slice(0, done), reports: partial });
          await partialWrite();
        },
      });
      const result = compareSkillArms({ ...input, tasks, reports });
      session.pendingComparison = null;
      session.skillComparisons.push(result);
      if (!options.json) printSkillComparison(cli, result);
    }
  }

  const passed =
    lintPassed &&
    session.skillComparisons.every((c) => c.passed) &&
    session.reports.every((r) => r.summary.failed === 0 && r.summary.inconclusive === 0);
  const exitCode = passed ? EXIT.OK : EXIT.ERROR;
  const report = sessionReport(session, exitCode, true);
  if (options.json) cli.out.json(report);
  await writeOut(session, report);
  return exitCode;
}

const signed = (v: number, fmt: (x: number) => string) => {
  const text = fmt(Math.abs(v));
  return text === fmt(0) ? text : `${v > 0 ? '+' : '-'}${text}`;
};
const pts = (v: number) => `${Math.round(v * 100)} pts`;
const secs = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const toks = (n: number) => `${Math.round(n)} tokens`;
const usd = (n: number) => `$${n.toFixed(4)}`;

/** `+33 pts (95% CI -12..+71)`, or `n/a` / `not reported`. */
function delta(d: Delta, fmt: (x: number) => string, missing = 'n/a'): string {
  if (d.delta === null) return missing;
  const range = d.ci95 ? ` (95% CI ${signed(d.ci95.low, fmt)}..${signed(d.ci95.high, fmt)})` : '';
  return `${signed(d.delta, fmt)}${range}`;
}

function armCell(stats: { status: string; errored: number; completion: { met: number; runs: number } | null; correctActivation: { met: number; runs: number } | null; runs: number }, measure: 'completion' | 'activation'): string {
  if (stats.status === 'not-run') return '-';
  const rate = measure === 'completion' ? stats.completion : stats.correctActivation;
  const main = rate ? `${rate.met}/${rate.runs}` : `0/0`;
  return stats.errored ? `${main} (${stats.errored} err)` : main;
}

const VERDICT_LABEL: Record<string, string> = { improves: 'improves', 'no-difference': 'no measurable difference', regresses: 'REGRESSES', inconclusive: 'INCONCLUSIVE' };

function printSkillComparison(cli: Cli, c: SkillComparison): void {
  const { out } = cli;
  out.heading(`Compare ${c.skill} (${c.provider}, ${c.mode}, ${c.runs} run(s) per arm, seed ${c.seed})`);
  for (const arm of c.arms) {
    const what = arm.skill ? `${arm.skill.version ?? 'unversioned'} ${arm.skill.contentHash.slice(0, 19)}` : arm.id === 'baseline' ? 'skill not installed' : 'not installed';
    out.line(`  ${arm.id}: ${arm.unavailable ? `unavailable (${arm.unavailable})` : what}`);
  }
  const pairIds = c.scenarios[0]?.pairs.length ? [...new Map(c.scenarios.flatMap((s) => s.pairs).map((p) => [p.reference, p])).keys()] : [];
  const rows = c.scenarios.map((s) => [
    `${s.heldOut ? '(held-out) ' : ''}${s.scenario}`,
    s.measure,
    ...c.arms.map((a) => armCell(s.arms.find((x) => x.arm === a.id)!, s.measure)),
    ...pairIds.map((ref) => {
      const p = s.pairs.find((x) => x.reference === ref);
      return p ? `${VERDICT_LABEL[p.verdict]} ${p.rate.delta === null ? '' : signed(p.rate.delta, pts)}`.trim() : '-';
    }),
  ]);
  out.lines(table(['SCENARIO', 'MEASURE', ...c.arms.map((a) => a.id.toUpperCase()), ...pairIds.map((r) => `VS ${r.toUpperCase()}`)], rows, '  '));
  for (const s of c.scenarios) for (const p of s.pairs) if (p.verdict === 'regresses' || p.verdict === 'inconclusive') out.line(`  ${s.scenario} vs ${p.reference}: ${p.reasons.join('; ')}`);
  for (const [label, pairs] of [['authoring scenarios', c.summary.authoring], ['held-out scenarios', c.summary.heldOut]] as const) {
    for (const p of pairs) {
      const rate = p.completion ? `completion ${delta(p.completion, pts)}` : p.activation ? `correct activation ${delta(p.activation, pts)}` : 'no rate measured';
      out.line(`  ${p.candidate} vs ${p.reference} (${label}): ${VERDICT_LABEL[p.verdict]}; ${rate}`);
      out.line(
        `    overhead: time ${delta(p.durationMs, secs)}, tokens ${delta(p.tokens, toks, 'not reported')}, cost ${delta(p.costUsd, usd, 'not reported')}; asked user ${delta(p.intervention, pts)}; unexpected edits ${delta(p.unexpectedChanges, (x) => x.toFixed(1), 'not declared')}`,
      );
    }
  }
  out.line(`  verdict: ${VERDICT_LABEL[c.verdict]} -> gate ${c.passed ? 'passed' : 'FAILED'}`);
  out.line();
}

function printPackActivation(cli: Cli, heading: string, act: PackActivation): void {
  const { out } = cli;
  out.heading(heading);
  const columns = [...act.skills, '(none)'];
  out.lines(table(['EXPECTED \\ ACTIVATED', ...columns, 'RUNS'], act.matrix.map((r) => [r.expected, ...columns.map((c) => String(r.activated[c] ?? 0)), String(r.runs)]), '  '));
  out.lines(table(['SKILL', 'PRECISION', 'RECALL', 'ERRORS'], act.perSkill.map((m) => [m.skill, pct(m.precision), pct(m.recall), String(m.errored)]), '  '));
  if (act.erroredRuns) out.line(`  ${act.erroredRuns} run(s) could not be scored and are not in the matrix`);
  out.line();
}

function printPackComparison(cli: Cli, c: PackComparison): void {
  const { out } = cli;
  const changes = [...c.added, ...c.replaced.map((id) => `${id} (new copy)`)].join(', ');
  out.heading(`Pack ${c.pack} with ${changes} vs without (${c.provider}, ${c.runs} run(s) per arm, seed ${c.seed})`);
  const rate = (v: number | null) => pct(v);
  out.lines(
    table(
      ['SKILL', 'SET', 'PRECISION', 'DELTA', 'RECALL', 'DELTA', 'VERDICT'],
      c.skills.map((s) => [
        s.skill,
        s.set,
        `${rate(s.precision.without)} -> ${rate(s.precision.with)}`,
        delta(s.precision, pts),
        `${rate(s.recall.without)} -> ${rate(s.recall.with)}`,
        delta(s.recall, pts),
        VERDICT_LABEL[s.verdict]!,
      ]),
      '  ',
    ),
  );
  for (const s of c.skills) if (s.reasons.length && s.verdict !== 'no-difference' && s.verdict !== 'improves') out.line(`  ${s.skill} (${s.set}): ${s.reasons.join('; ')}`);
  for (const reason of c.reasons) out.line(`  ${reason}`);
  out.line();
  printPackActivation(cli, `With ${changes}`, c.activation.with);
  out.line(`  verdict: ${VERDICT_LABEL[c.verdict]} -> gate ${c.passed ? 'passed' : 'FAILED'}`);
  out.line();
}

