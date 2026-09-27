import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  describeSource,
  findProjectRoot,
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
  compareProviders,
  compareQuestionPreferences,
  discoverSkillDirs,
  DRIVERS,
  lintSkill,
  listCatalog,
  runEvals,
  type EvalReport,
  type Interval,
  type LintResult,
  type PreferenceComparison,
  type ScenarioResult,
} from '@agileflow/evals';
import type { Cli } from '../runtime';
import { EXIT, servicesFor, splitList, UsageError } from '../runtime';
import { table } from '../ui/tables';

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
}

/** Exit codes, as documented in `agileflow eval --help`. */
export const EVAL_EXIT_HELP = [
  'Exit codes:',
  '  0  every skill passed the release gate and every scenario passed',
  '  1  a skill failed the gate, a scenario failed or errored (setup, provider crash or',
  '     timeout, judge failure, isolation leak), a question-preference comparison is out',
  '     of order, or the command was used incorrectly',
].join('\n');

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
  /** Skill dirs whose scenario `setup` scripts may run without --allow-setup. */
  trusted: Set<string>;
  /** Temp directories to remove when the command ends. */
  temp: string[];
}

/**
 * Installed skills do not carry their eval scenarios (they are stripped on
 * install), so evaluate the exact locked package from the cache instead.
 * Official-registry packages are trusted to run setup scripts; anything from
 * git, a path in the project config, or a registry the project config points
 * at is not.
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
  if (describeSource(entry.source) === 'official' && (cli.ctx.env.AGILEFLOW_REGISTRY || !projectRegistry)) resolved.trusted.add(dir);
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
  if (!targets.length) {
    if (catalogDir) {
      // A directory the user pointed at explicitly: its setup scripts may run.
      for (const dir of await listCatalog(catalogDir)) add(dir, true);
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
  try {
    for (const t of targets) {
      if (catalogDir && (await readTextIfExists(path.join(catalogDir, t, SKILL_FILE))) !== null) {
        add(path.join(catalogDir, t), true);
        continue;
      }
      const local = path.resolve(ctx.cwd, t);
      const discovered = (await pathExists(local)) ? await discoverSkillDirs(local) : [];
      if (discovered.length) {
        for (const dir of discovered) add(dir, true);
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
      throw new UsageError(`Skill "${t}" not found`, [
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

const MARKS: Record<ScenarioResult['status'], string> = { passed: '[ok]', failed: '[x]', error: '[err]' };

function printScenario(cli: Cli, r: ScenarioResult): void {
  const { out } = cli;
  const scored = r.runs.filter((x) => x.status === 'ok');
  const activated = scored.filter((x) => x.activated).length;
  const rubric = r.rubricScore === null ? '' : `  rubric ${pct(r.rubricScore)}`;
  const asked = scored.filter((x) => x.askedUser).length;
  const pass = r.passRate.runs ? `  pass ${r.passRate.passed}/${r.passRate.runs}${ci(r.passRate.ci95)}` : '';
  const expected = `expected ${r.expected ? 'yes' : 'no'}${r.invocation === 'explicit' ? ', explicit' : ''}`;
  out.line(
    `  ${MARKS[r.status]} ${r.skill}/${r.scenario}  activated ${activated}/${scored.length} (${expected})${pass}  asked user ${asked}/${scored.length}${rubric}`,
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
    for (const item of run.rubric?.items ?? []) if (!item.pass) out.line(`       rubric (${item.source}) failed: ${item.criterion}: ${item.reason}`);
    for (const v of run.violations) out.line(`       forbidden ${v.kind} (${v.rule}): ${v.evidence}`);
    if (run.otherActivations.length) out.line(`       also activated: ${run.otherActivations.join(', ')}`);
  }
  const ungraded = r.runs.find((x) => x.rubric?.ungraded.length)?.rubric?.ungraded.length;
  if (ungraded) out.line(`       ${ungraded} judge criteria not graded (--judge none)`);
  for (const e of r.errors) out.line(`       error: ${e}`);
}

function printEvalReport(cli: Cli, report: EvalReport): void {
  const { out } = cli;
  const flags = [report.mode, report.isolated ? 'isolated' : 'not isolated'];
  if (report.questionPreference) flags.push(`questionPreference: ${report.questionPreference}`);
  if (report.judge) flags.push(`judge: ${report.judge}`);
  out.heading(`${report.provider} (${flags.join(', ')})`);
  const standard = report.results.filter((r) => r.kind !== 'adversarial');
  const adversarial = report.results.filter((r) => r.kind === 'adversarial');
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
      ['SKILL', 'PASSED', 'FAILED', 'ERRORS', 'PRECISION', 'RECALL', 'F1', 'EXPLICIT'],
      report.skills.map((s) => [
        s.skill,
        String(s.passed),
        String(s.failed),
        String(s.errored),
        pct(s.activation.precision),
        pct(s.activation.recall),
        pct(s.activation.f1),
        s.explicit.runs ? `${s.explicit.loaded}/${s.explicit.runs}` : '-',
      ]),
      '  ',
    ),
  );
  const s = report.summary;
  const adv = s.adversarial.scenarios ? `; adversarial ${s.adversarial.passed}/${s.adversarial.scenarios} passed` : '';
  out.line(
    `  ${s.passed}/${s.scenarios} scenarios passed, ${s.failed} failed, ${s.errored} errors${adv}; activation precision ${pct(s.precision)}, recall ${pct(s.recall)}, F1 ${pct(s.f1)}`,
  );
  out.line();
}

function printProviderComparison(cli: Cli, reports: EvalReport[]): void {
  const comparison = compareProviders(reports);
  if (!comparison) return;
  const cell = (v: { status: string; passRate: number | null } | null) =>
    v === null ? '-' : `${v.status === 'passed' ? 'ok' : v.status === 'failed' ? 'FAIL' : 'ERR'} ${pct(v.passRate)}`;
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
    summary('PASSED', (c) => `${comparison.summary[c]!.passed}/${comparison.summary[c]!.passed + comparison.summary[c]!.failed + comparison.summary[c]!.errored}`),
  );
  cli.out.lines(table(['SCENARIO', ...comparison.columns.map((c) => c.toUpperCase())], rows));
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

  const resolved = await resolveSkillDirs(cli, targets, options.catalog);
  try {
    return await evaluate(cli, resolved, options, { runs, passRate, rubricThreshold, timeout, providers, PREFERENCES });
  } finally {
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
  const lint: LintResult[] = [];
  for (const dir of dirs) lint.push(await lintSkill(dir, { official: await isOfficial(dir), catalog, fixturesDir }));
  const lintPassed = lint.every((r) => r.passed);

  if (options.lint || !parsed.providers.length) {
    const exitCode = lintPassed ? EXIT.OK : EXIT.ERROR;
    const report = buildJsonReport({ lint, reports: [], exitCode });
    if (options.json) cli.out.json(report);
    else {
      printLint(cli, lint);
      if (!options.lint) {
        cli.out.line();
        cli.out.line('Structural checks only. Run behavioral evals against a real provider with:');
        cli.out.line('  agileflow eval <skills> --provider claude|codex|gemini|opencode [--mode full]');
      }
    }
    if (options.out) await writeFileAtomic(path.resolve(cli.ctx.cwd, options.out), JSON.stringify(report, null, 2) + '\n');
    return exitCode;
  }

  const preferences: Array<InteractionPreference | undefined> =
    options.questionPreference === 'all' ? parsed.PREFERENCES : [options.questionPreference as InteractionPreference | undefined];
  const mode = options.mode === 'full' ? 'full' : 'activation';
  const isolate = options.isolate !== false;
  for (const id of parsed.providers) {
    const driver = DRIVERS[id]!;
    if (!(await driver.available(cli.ctx.env))) {
      throw new UsageError(`${driver.displayName} (\`${driver.executable}\`) is not installed or not on PATH`);
    }
  }
  // The judge never inherits --model: that names the model under test, possibly another vendor's.
  const judge = mode === 'full' && options.judge !== 'none' ? claudeJudge({ env: cli.ctx.env, model: options.judgeModel, isolate }) : null;
  const skipped = dirs.filter((d) => !resolved.trusted.has(d));
  if (skipped.length && !options.allowSetup && !options.json) {
    cli.out.warn(
      `setup scripts of ${skipped.map((d) => path.basename(d)).join(', ')} will not run (not from the official catalog or a local path you passed); scenarios that need them report an error. Review their evals/ and pass --allow-setup to run them.`,
    );
  }

  const reports: EvalReport[] = [];
  const comparisons: Array<PreferenceComparison & { provider: string }> = [];
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
        setupAllowed: options.allowSetup ? () => true : (dir) => resolved.trusted.has(dir),
        filter: options.scenario?.length ? (sc) => options.scenario!.includes(sc.name) : undefined,
        onProgress: options.json ? undefined : (m) => cli.out.stderr.write(`${m}${questionPreference ? ` [${questionPreference}]` : ''}\n`),
      });
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
    reports.every((r) => r.summary.failed === 0 && r.summary.errored === 0) &&
    comparisons.every((c) => c.ordered !== false);
  const exitCode = passed ? EXIT.OK : EXIT.ERROR;
  const report = buildJsonReport({ lint, reports, preferenceComparisons: comparisons, exitCode });
  if (options.json) cli.out.json(report);
  if (options.out) await writeFileAtomic(path.resolve(cli.ctx.cwd, options.out), JSON.stringify(report, null, 2) + '\n');
  return exitCode;
}
