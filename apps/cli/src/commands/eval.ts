import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  findProjectRoot,
  loadWorkspace,
  pathExists,
  projectScope,
  readTextIfExists,
  SKILL_FILE,
  writeFileAtomic,
  writeTree,
} from '@agileflow/core';
import { claudeJudge, DRIVERS, lintSkill, listCatalog, runEvals, type EvalReport, type LintResult } from '@agileflow/evals';
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
  model?: string;
  fixtures?: string;
  json?: boolean;
  out?: string;
  keep?: boolean;
  passRate?: string;
  rubricThreshold?: string;
  timeout?: string;
  scenario?: string[];
}

/**
 * Installed skills do not carry their eval scenarios (they are stripped on
 * install), so evaluate the exact locked package from the cache instead.
 */
async function lockedPackageDir(cli: Cli, projectRoot: string, id: string): Promise<string | null> {
  const scope = projectScope(projectRoot);
  const ws = await loadWorkspace(scope);
  const entry = ws.lock.resolved[id];
  if (!entry || entry.ownership !== 'managed') return null;
  const services = await servicesFor(cli.ctx, scope);
  const pkg = await services.fetcher.fetchLocked(id, entry, scope.root);
  const dir = path.join(await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agileflow-eval-pkg-')), id);
  await writeTree(dir, pkg.files);
  return dir;
}

async function resolveSkillDirs(cli: Cli, targets: string[], catalog: string | undefined): Promise<string[]> {
  const { ctx } = cli;
  const catalogDir = catalog ? path.resolve(ctx.cwd, catalog) : null;
  const projectRoot = await findProjectRoot(ctx.cwd);
  const projectSkills = projectRoot ? path.join(projectRoot, '.agents', 'skills') : null;
  if (!targets.length) {
    if (catalogDir) return listCatalog(catalogDir);
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
  const out: string[] = [];
  for (const t of targets) {
    const candidates = [
      path.resolve(ctx.cwd, t),
      ...(catalogDir ? [path.join(catalogDir, t)] : []),
    ];
    let found: string | null = null;
    for (const c of candidates) {
      if ((await readTextIfExists(path.join(c, SKILL_FILE))) !== null) {
        found = c;
        break;
      }
    }
    if (!found && projectRoot) found = await lockedPackageDir(cli, projectRoot, t);
    if (!found && projectSkills && (await readTextIfExists(path.join(projectSkills, t, SKILL_FILE))) !== null) {
      found = path.join(projectSkills, t);
    }
    if (!found) throw new UsageError(`Skill "${t}" not found`, ['Pass a skill directory, or a name with --catalog <dir>.']);
    out.push(found);
  }
  return out;
}

async function isOfficial(dir: string): Promise<boolean> {
  const sidecar = await readTextIfExists(path.join(dir, 'agileflow.skill.yaml'));
  return !!sidecar && sidecar.includes(`"@agileflow/${path.basename(dir)}"`);
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

function printEvalReport(cli: Cli, report: EvalReport): void {
  const { out } = cli;
  out.heading(`${report.provider} (${report.mode})`);
  for (const r of report.results) {
    const activated = r.runs.filter((x) => x.activated).length;
    const rubric = r.rubricScore === null ? '' : `  rubric ${(r.rubricScore * 100).toFixed(0)}%`;
    out.line(
      `  ${r.passed ? '[ok]' : '[x]'} ${r.skill}/${r.scenario}  activated ${activated}/${r.runs.length} (expected ${r.expected ? 'yes' : 'no'}${r.invocation === 'explicit' ? ', explicit' : ''})${rubric}`,
    );
    for (const e of r.errors) out.line(`       ${e}`);
  }
  const s = report.summary;
  const pct = (v: number | null) => (v === null ? 'n/a' : `${(v * 100).toFixed(0)}%`);
  out.line(`  ${s.passed}/${s.scenarios} scenarios passed; activation precision ${pct(s.precision)}, recall ${pct(s.recall)}`);
}

export async function runEval(cli: Cli, targets: string[], options: EvalOptions): Promise<number> {
  const dirs = await resolveSkillDirs(cli, targets, options.catalog);
  if (!dirs.length) throw new UsageError('No skills with evals found');

  const lint: LintResult[] = [];
  for (const dir of dirs) lint.push(await lintSkill(dir, { official: await isOfficial(dir) }));
  const lintPassed = lint.every((r) => r.passed);

  if (options.lint || !options.provider) {
    if (options.json) cli.out.json({ lint });
    else {
      printLint(cli, lint);
      if (!options.provider && !options.lint) {
        cli.out.line();
        cli.out.line('Structural checks only. Run behavioral evals against a real provider with:');
        cli.out.line('  agileflow eval <skills> --provider claude|codex|gemini|opencode [--mode full]');
      }
    }
    return lintPassed ? EXIT.OK : EXIT.ERROR;
  }

  const providers = splitList(options.provider);
  const mode = options.mode === 'full' ? 'full' : 'activation';
  if (options.mode && options.mode !== 'full' && options.mode !== 'activation') {
    throw new UsageError('--mode must be activation or full');
  }
  const catalogDirs = options.catalog ? await listCatalog(path.resolve(cli.ctx.cwd, options.catalog)) : dirs;
  let fixturesDir = options.fixtures ? path.resolve(cli.ctx.cwd, options.fixtures) : undefined;
  if (!fixturesDir && options.catalog) {
    const guess = path.resolve(cli.ctx.cwd, options.catalog, '..', 'fixtures');
    if (await pathExists(guess)) fixturesDir = guess;
  }
  const reports: EvalReport[] = [];
  for (const id of providers) {
    const driver = DRIVERS[id];
    if (!driver) throw new UsageError(`Unknown eval provider "${id}" (known: ${Object.keys(DRIVERS).join(', ')})`);
    if (!(await driver.available(cli.ctx.env))) {
      throw new UsageError(`${driver.displayName} (\`${driver.executable}\`) is not installed or not on PATH`);
    }
    const judge =
      mode === 'full' && options.judge !== 'none'
        ? claudeJudge({ cwd: cli.ctx.cwd, env: cli.ctx.env, model: options.model })
        : null;
    const report = await runEvals({
      skillDirs: dirs,
      catalogDirs,
      driver,
      judge,
      runs: options.runs ? Number(options.runs) : 1,
      mode,
      fixturesDir,
      model: options.model,
      env: cli.ctx.env,
      keep: options.keep,
      passRate: options.passRate ? Number(options.passRate) : undefined,
      rubricThreshold: options.rubricThreshold ? Number(options.rubricThreshold) : undefined,
      timeoutMs: options.timeout ? Number(options.timeout) * 1000 : undefined,
      filter: options.scenario?.length ? (sc) => options.scenario!.includes(sc.name) : undefined,
      onProgress: options.json ? undefined : (m) => cli.out.stderr.write(`${m}\n`),
    });
    reports.push(report);
    if (!options.json) printEvalReport(cli, report);
  }
  const serializable = reports.map((r) => ({
    ...r,
    results: r.results.map((x) => ({
      ...x,
      runs: x.runs.map((run) => ({
        activated: run.activated,
        rubric: run.rubric,
        sandbox: run.sandbox,
        exitCode: run.transcript.exitCode,
        durationMs: run.transcript.durationMs,
        toolCalls: run.transcript.toolCalls,
        finalText: run.transcript.finalText,
        error: run.transcript.error,
      })),
    })),
  }));
  if (options.json) cli.out.json({ lint, reports: serializable });
  if (options.out) {
    await writeFileAtomic(path.resolve(cli.ctx.cwd, options.out), JSON.stringify({ lint, reports: serializable }, null, 2) + '\n');
  }
  const passed = lintPassed && reports.every((r) => r.summary.failed === 0);
  return passed ? EXIT.OK : EXIT.ERROR;
}
