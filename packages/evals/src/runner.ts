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
} from '@agileflow/core';
import { allAdapters } from '@agileflow/providers';
import { createFetcher } from '@agileflow/registry';
import type { Judge, RubricResult } from './assertions';
import type { EvalDriver, Transcript } from './providers';
import { loadScenarios, type LoadedScenario } from './scenarios';

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
  /** Keep sandboxes for inspection. */
  keep?: boolean;
}

export interface RunResult {
  activated: boolean;
  transcript: Transcript;
  rubric: RubricResult | null;
  sandbox: string | null;
}

export interface ScenarioResult {
  skill: string;
  scenario: string;
  expected: boolean;
  invocation: 'implicit' | 'explicit';
  runs: RunResult[];
  activationRate: number;
  activationPass: boolean;
  rubricScore: number | null;
  rubricPass: boolean | null;
  passed: boolean;
  errors: string[];
}

export interface EvalReport {
  provider: string;
  mode: 'activation' | 'full';
  results: ScenarioResult[];
  summary: {
    scenarios: number;
    passed: number;
    failed: number;
    truePositive: number;
    falsePositive: number;
    falseNegative: number;
    trueNegative: number;
    precision: number | null;
    recall: number | null;
  };
}

async function git(args: string[], cwd: string): Promise<void> {
  await execFileAsync('git', args, { cwd, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } });
}

/** Create a throwaway repository with the catalog installed exactly as a user would get it. */
export async function prepareSandbox(options: {
  catalogDirs: string[];
  fixtureDir: string | null;
  env: Record<string, string | undefined>;
}): Promise<string> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agileflow-eval-'));
  if (options.fixtureDir && (await pathExists(options.fixtureDir))) {
    await copyTree(options.fixtureDir, dir);
  } else {
    await fs.promises.writeFile(path.join(dir, 'README.md'), '# Sandbox project\n');
  }
  const cacheDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'agileflow-eval-cache-'));
  const ctx = createContext({ cwd: dir, cacheDir, env: options.env });
  const services = { ctx, fetcher: createFetcher({ ctx }), adapters: allAdapters() };
  const scope = projectScope(dir);
  await setConfigValue(scope, ['providers', 'claude', 'enabled'], true);
  const ws = await loadWorkspace(scope);
  const prepared = await prepareAdd(
    services,
    ws,
    options.catalogDirs.map((d) => ({ id: path.basename(d), spec: { source: path.resolve(d) } })),
  );
  await commitAdd(services, ws, prepared);
  await fs.promises.rm(cacheDir, { recursive: true, force: true });
  await git(['init', '--quiet', '--initial-branch=main'], dir);
  await git(['add', '-A'], dir);
  await git(['-c', 'user.name=AgileFlow Eval', '-c', 'user.email=eval@agileflow.invalid', 'commit', '--quiet', '-m', 'sandbox'], dir);
  return dir;
}

/** Run a scenario's setup script with a fixed git identity. */
export async function runSetup(script: string, cwd: string): Promise<void> {
  try {
    await execFileAsync('sh', ['-e', '-c', script], {
      cwd,
      env: {
        ...process.env,
        GIT_AUTHOR_NAME: 'Eval Author',
        GIT_AUTHOR_EMAIL: 'author@agileflow.invalid',
        GIT_COMMITTER_NAME: 'Eval Author',
        GIT_COMMITTER_EMAIL: 'author@agileflow.invalid',
        GIT_TERMINAL_PROMPT: '0',
      },
    });
  } catch (err) {
    const e = err as { stderr?: string; message: string };
    throw new Error(`scenario setup failed: ${(e.stderr || e.message).trim().split('\n').slice(-3).join(' ')}`);
  }
}

function ratio(n: number, d: number): number | null {
  return d === 0 ? null : n / d;
}

export async function runEvals(options: RunEvalsOptions): Promise<EvalReport> {
  const env = options.env ?? process.env;
  const runs = Math.max(1, options.runs ?? 1);
  const mode = options.mode ?? 'activation';
  const rubricThreshold = options.rubricThreshold ?? 0.75;
  const passRate = options.passRate ?? 1;
  const catalog = options.catalogDirs ?? options.skillDirs;
  const results: ScenarioResult[] = [];

  for (const skillDir of options.skillDirs) {
    const { scenarios, errors } = await loadScenarios(skillDir);
    if (errors.length) {
      results.push({
        skill: path.basename(skillDir),
        scenario: '(load)',
        expected: false,
        invocation: 'implicit',
        runs: [],
        activationRate: 0,
        activationPass: false,
        rubricScore: null,
        rubricPass: null,
        passed: false,
        errors,
      });
    }
    for (const scenario of scenarios) {
      if (options.filter && !options.filter(scenario)) continue;
      const runResults: RunResult[] = [];
      const scenarioErrors: string[] = [];
      for (let i = 0; i < runs; i++) {
        options.onProgress?.(`${options.driver.id}: ${scenario.skill}/${scenario.name} (run ${i + 1}/${runs})`);
        const fixtureDir = options.fixturesDir
          ? path.join(options.fixturesDir, scenario.fixture ?? options.defaultFixture ?? 'clean-node')
          : null;
        const sandbox = await prepareSandbox({ catalogDirs: catalog, fixtureDir, env });
        try {
          if (scenario.setup) await runSetup(scenario.setup, sandbox);
          const transcript = await options.driver.run({
            cwd: sandbox,
            prompt: scenario.prompt,
            skillId: scenario.skill,
            invocation: scenario.invocation,
            mode,
            model: options.model,
            timeoutMs: options.timeoutMs ?? 300000,
            env,
          });
          if (transcript.error) scenarioErrors.push(`run ${i + 1}: ${transcript.error}`);
          const activated = options.driver.activated(transcript, scenario.skill);
          let rubric: RubricResult | null = null;
          if (scenario.assert.shouldActivate && scenario.rubric?.length && options.judge && mode === 'full') {
            try {
              rubric = await options.judge.grade(scenario.prompt, scenario.rubric, transcript);
            } catch (err) {
              scenarioErrors.push(`run ${i + 1}: judge failed: ${(err as Error).message}`);
            }
          }
          runResults.push({ activated, transcript, rubric, sandbox: options.keep ? sandbox : null });
        } finally {
          if (!options.keep) await fs.promises.rm(sandbox, { recursive: true, force: true });
        }
      }
      const matches = runResults.filter((r) => r.activated === scenario.assert.shouldActivate).length;
      const activationRate = runResults.filter((r) => r.activated).length / runResults.length;
      const activationPass = matches / runResults.length >= passRate;
      const graded = runResults.filter((r) => r.rubric);
      const rubricScore = graded.length
        ? graded.reduce((sum, r) => sum + r.rubric!.score, 0) / graded.length
        : null;
      const rubricPass = rubricScore === null ? null : rubricScore >= rubricThreshold;
      const infraFailure = runResults.every((r) => r.transcript.exitCode !== 0 && r.transcript.toolCalls.length === 0);
      results.push({
        skill: scenario.skill,
        scenario: scenario.name,
        expected: scenario.assert.shouldActivate,
        invocation: scenario.invocation,
        runs: runResults,
        activationRate,
        activationPass,
        rubricScore,
        rubricPass,
        passed: activationPass && rubricPass !== false && !infraFailure,
        errors: scenarioErrors,
      });
    }
  }

  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  for (const r of results) {
    for (const run of r.runs) {
      if (r.expected && run.activated) tp++;
      else if (r.expected) fn++;
      else if (run.activated) fp++;
      else tn++;
    }
  }
  const passed = results.filter((r) => r.passed).length;
  return {
    provider: options.driver.id,
    mode,
    results,
    summary: {
      scenarios: results.length,
      passed,
      failed: results.length - passed,
      truePositive: tp,
      falsePositive: fp,
      falseNegative: fn,
      trueNegative: tn,
      precision: ratio(tp, tp + fp),
      recall: ratio(tp, tp + fn),
    },
  };
}
