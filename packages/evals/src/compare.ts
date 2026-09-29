import path from 'node:path';
import { isAborting } from './cleanup';
import { meanDifference, meanStat, newcombeInterval, ratio, wilsonInterval, type Interval, type MeanStat } from './metrics';
import { totalTokens } from './providers';
import {
  createEvalRunner,
  notRunResult,
  type EvalReport,
  type EvalRunner,
  type RateCount,
  type RunEvalsOptions,
  type RunResult,
  type ScenarioResult,
  type ScenarioStatus,
} from './runner';
import type { LoadedScenario } from './scenarios';
import type { SkillInfo } from './versions';

/**
 * Comparisons answer "did this skill improve the result, and was it worth its
 * overhead?" The same scenarios run under matched conditions in several arms
 * (e.g. no skill, the released skill, the candidate), with the arm order
 * shuffled for every trial so drift over the session (rate limits, caches,
 * time of day) does not favor one arm. Infrastructure errors in either arm of
 * a comparison make it inconclusive, never a win.
 */

// ---------------------------------------------------------------------------
// Running arms
// ---------------------------------------------------------------------------

export interface ArmSpec {
  /** `baseline`, `released`, `candidate` (skill comparison) or `without`, `with` (pack comparison). */
  id: string;
  /** Skills installed in this arm's sandboxes. */
  catalogDirs: string[];
  /** Why the arm cannot run (e.g. the released version could not be fetched); its comparisons are inconclusive. */
  unavailable?: string | null;
}

export interface ArmTask {
  scenario: LoadedScenario;
  /** Skill directory the scenario comes from (trust for setup scripts). */
  skillDir: string;
  /** Arms that run this scenario. */
  arms: string[];
}

export interface RunArmsOptions extends Omit<RunEvalsOptions, 'skillDirs' | 'catalogDirs' | 'filter' | 'onScenario' | 'describeDirs' | 'includeHeldOut'> {
  arms: ArmSpec[];
  tasks: ArmTask[];
  seed: number;
  /** Called with every arm's report so far after each scenario (for incremental `--out` files). */
  onTask?: (reports: Record<string, EvalReport>) => void | Promise<void>;
}

/** Deterministic PRNG (mulberry32), so a comparison's arm order is reproducible from its seed. */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Run every task in every arm it names, interleaving arms in a fresh random order per trial. */
export async function runArms(options: RunArmsOptions): Promise<Record<string, EvalReport>> {
  const runs = options.runs ?? 1;
  if (!Number.isInteger(runs) || runs < 1) throw new Error(`runs must be a positive integer (got ${runs})`);
  const random = seededRandom(options.seed);
  const skillDirs = [...new Set(options.tasks.map((t) => t.skillDir))];
  const runners = new Map<string, EvalRunner>();
  const results = new Map<string, ScenarioResult[]>();
  for (const arm of options.arms) {
    results.set(arm.id, []);
    runners.set(
      arm.id,
      await createEvalRunner({
        ...options,
        skillDirs,
        catalogDirs: arm.catalogDirs,
        describeDirs: arm.catalogDirs,
        includeHeldOut: true,
        transcriptDir: options.transcriptDir ? path.join(options.transcriptDir, arm.id) : undefined,
      }),
    );
  }
  const reports = async () => {
    const out: Record<string, EvalReport> = {};
    for (const arm of options.arms) out[arm.id] = await runners.get(arm.id)!.report(results.get(arm.id)!);
    return out;
  };
  for (const task of options.tasks) {
    // An interrupted eval starts nothing new.
    if (isAborting()) break;
    const arms = options.arms.filter((a) => task.arms.includes(a.id));
    for (const arm of arms.filter((a) => a.unavailable)) results.get(arm.id)!.push(notRunResult(task.scenario, 'unavailable'));
    const active = arms.filter((a) => !a.unavailable);
    const byArm = new Map(active.map((a) => [a.id, [] as RunResult[]]));
    for (let i = 0; i < runs && !isAborting(); i++) {
      for (const arm of shuffle(active, random)) {
        if (isAborting()) break;
        options.onProgress?.(`${options.driver.id} [${arm.id}]: ${task.scenario.skill}/${task.scenario.name} (run ${i + 1}/${runs})`);
        byArm.get(arm.id)!.push(await runners.get(arm.id)!.run(task.scenario, task.skillDir, i));
      }
    }
    for (const arm of active) results.get(arm.id)!.push(await runners.get(arm.id)!.summarize(task.scenario, task.skillDir, byArm.get(arm.id)!));
    await options.onTask?.(await reports());
  }
  return reports();
}

// ---------------------------------------------------------------------------
// Skill comparison
// ---------------------------------------------------------------------------

export type Verdict = 'improves' | 'no-difference' | 'regresses' | 'inconclusive';

/** `candidate - reference`, with a 95% interval (Newcombe for rates, Welch-style for means). */
export interface Delta {
  delta: number | null;
  ci95: Interval | null;
}

/** One arm's measurements on one scenario (scored runs only; errored runs are counted, never measured). */
export interface ArmStats {
  arm: string;
  status: ScenarioStatus;
  runs: number;
  errored: number;
  /** Runs whose task completion was measured (positive full-mode scenarios with a rubric or interaction). */
  completion: RateCount | null;
  /** Runs whose activation was observed and matched the expectation. */
  correctActivation: RateCount | null;
  /** Runs that stopped to ask the user (intervention required). */
  intervention: RateCount;
  changedFiles: MeanStat;
  /** Files changed outside `assert.changes` (null without it). */
  unexpectedChanges: MeanStat | null;
  durationMs: MeanStat;
  /** Total tokens, when the provider reports usage (null: not reported). */
  tokens: MeanStat | null;
  costUsd: MeanStat | null;
}

export interface PairComparison {
  reference: string;
  candidate: string;
  /** What decides the verdict: task completion, or correct activation where completion is not measured. */
  measure: 'completion' | 'activation';
  rate: Delta;
  intervention: Delta;
  changedFiles: Delta;
  unexpectedChanges: Delta;
  durationMs: Delta;
  tokens: Delta;
  costUsd: Delta;
  verdict: Verdict;
  reasons: string[];
}

export interface ScenarioComparison {
  skill: string;
  scenario: string;
  heldOut: boolean;
  expected: boolean;
  measure: 'completion' | 'activation';
  arms: ArmStats[];
  pairs: PairComparison[];
  /**
   * This scenario's own verdict: `regresses` when the candidate broke a
   * `forbid` rule, `inconclusive` when any arm errored or did not run (even
   * with no pair to compare), else the worst pair verdict. null when nothing
   * was compared and nothing went wrong.
   */
  verdict: Verdict | null;
  reasons: string[];
}

/** One pair pooled over a set of scenarios (authoring or held-out). */
export interface PairSummary {
  reference: string;
  candidate: string;
  scenarios: number;
  completion: (Delta & { reference: RateCount; candidate: RateCount }) | null;
  activation: (Delta & { reference: RateCount; candidate: RateCount }) | null;
  intervention: Delta;
  unexpectedChanges: Delta;
  durationMs: Delta;
  tokens: Delta;
  costUsd: Delta;
  verdict: Verdict;
  reasons: string[];
}

export interface ArmDescription {
  id: string;
  unavailable: string | null;
  /** The copy of the skill under test this arm installed (null: not installed, the baseline). */
  skill: SkillInfo | null;
}

export interface SkillComparison {
  kind: 'skill';
  provider: string;
  skill: string;
  seed: number;
  runs: number;
  mode: 'activation' | 'full';
  arms: ArmDescription[];
  reports: Record<string, EvalReport>;
  scenarios: ScenarioComparison[];
  summary: { authoring: PairSummary[]; heldOut: PairSummary[] };
  /** Worst verdict over every pair and set: regresses, then inconclusive, then improves. */
  verdict: Verdict;
  /** The gate: no regression and nothing inconclusive. */
  passed: boolean;
}

interface Values {
  completion: [number, number];
  activation: [number, number];
  asked: [number, number];
  changed: number[];
  unexpected: number[];
  duration: number[];
  tokens: number[];
  cost: number[];
  errored: number;
  errorKinds: string[];
  /** Broken `forbid` rules across all runs, errored ones included. */
  violations: number;
}

function values(r: ScenarioResult | undefined): Values {
  const runs = r?.runs ?? [];
  const scored = runs.filter((x) => x.status === 'ok');
  const completed = scored.filter((x) => x.taskCompleted !== null);
  const observed = runs.filter((x) => x.activationObserved);
  return {
    completion: [completed.filter((x) => x.taskCompleted).length, completed.length],
    activation: [observed.filter((x) => x.activated === r!.expected).length, observed.length],
    asked: [scored.filter((x) => x.askedUser).length, scored.length],
    changed: scored.filter((x) => x.fileChanges).map((x) => x.fileChanges!.length),
    unexpected: scored.filter((x) => x.unexpectedChanges).map((x) => x.unexpectedChanges!.length),
    duration: scored.map((x) => x.transcript.durationMs),
    tokens: scored.filter((x) => x.transcript.usage).map((x) => totalTokens(x.transcript.usage!)),
    cost: scored.filter((x) => x.transcript.usage?.costUsd != null).map((x) => x.transcript.usage!.costUsd!),
    errored: runs.filter((x) => x.status === 'error').length,
    errorKinds: [...new Set(runs.filter((x) => x.error).map((x) => x.error!.kind))],
    violations: runs.reduce((n, x) => n + x.violations.length, 0),
  };
}

const rateOf = ([met, n]: [number, number]): RateCount => ({ met, runs: n, rate: ratio(met, n), ci95: n > 1 ? wilsonInterval(met, n) : null });

function armStats(arm: string, r: ScenarioResult | undefined): ArmStats {
  const v = values(r);
  return {
    arm,
    status: r?.status ?? 'not-run',
    runs: r?.runs.length ?? 0,
    errored: v.errored,
    completion: v.completion[1] ? rateOf(v.completion) : null,
    correctActivation: v.activation[1] ? rateOf(v.activation) : null,
    intervention: rateOf(v.asked),
    changedFiles: meanStat(v.changed),
    unexpectedChanges: v.unexpected.length ? meanStat(v.unexpected) : null,
    durationMs: meanStat(v.duration),
    tokens: v.tokens.length ? meanStat(v.tokens) : null,
    costUsd: v.cost.length ? meanStat(v.cost) : null,
  };
}

function rateDelta(cand: [number, number], ref: [number, number]): Delta {
  if (!cand[1] || !ref[1]) return { delta: null, ci95: null };
  return { delta: cand[0] / cand[1] - ref[0] / ref[1], ci95: newcombeInterval(cand[0], cand[1], ref[0], ref[1]) };
}

/** Verdict from a rate difference interval: only a difference beyond the interval counts. */
function verdictOf(d: Delta): Verdict {
  if (!d.ci95) return 'inconclusive';
  if (d.ci95.high < 0) return 'regresses';
  if (d.ci95.low > 0) return 'improves';
  return 'no-difference';
}

/** Why a comparison cannot be trusted: an arm did not run, errored, or measured nothing. */
function infrastructureReasons(arm: string, r: ScenarioResult | undefined, v: Values, unavailable: string | null | undefined): string[] {
  if (unavailable) return [`${arm} did not run: ${unavailable}`];
  if (!r || r.status === 'not-run') return [`${arm} did not run`];
  if (v.errored) return [`${v.errored} run(s) in ${arm} could not be scored (${v.errorKinds.join(', ')})`];
  return [];
}

function comparePair(
  reference: ArmSpec,
  candidate: ArmSpec,
  refResult: ScenarioResult | undefined,
  candResult: ScenarioResult | undefined,
  measure: 'completion' | 'activation',
): PairComparison {
  const rv = values(refResult);
  const cv = values(candResult);
  const rate = rateDelta(cv[measure], rv[measure]);
  const reasons = [
    ...infrastructureReasons(reference.id, refResult, rv, reference.unavailable),
    ...infrastructureReasons(candidate.id, candResult, cv, candidate.unavailable),
  ];
  let verdict: Verdict;
  // Unsafe behavior is a regression whatever else happened in the run.
  if (cv.violations) {
    verdict = 'regresses';
    reasons.unshift(`${candidate.id} broke a forbid rule (${cv.violations} violation(s))`);
  } else if (reasons.length) verdict = 'inconclusive';
  else if (!rate.ci95) {
    verdict = 'inconclusive';
    reasons.push(`no ${measure} was measured in one of the arms`);
  } else if (reference.id === 'released' && refResult!.status === 'passed' && candResult!.status === 'failed') {
    verdict = 'regresses';
    reasons.push('fails a scenario the released version passes');
  } else {
    verdict = verdictOf(rate);
    if (verdict === 'regresses') reasons.push(`${measure} is lower beyond the 95% interval`);
    if (verdict === 'improves') reasons.push(`${measure} is higher beyond the 95% interval`);
  }
  return {
    reference: reference.id,
    candidate: candidate.id,
    measure,
    rate,
    intervention: rateDelta(cv.asked, rv.asked),
    changedFiles: meanDifference(cv.changed, rv.changed),
    unexpectedChanges: meanDifference(cv.unexpected, rv.unexpected),
    durationMs: meanDifference(cv.duration, rv.duration),
    tokens: meanDifference(cv.tokens, rv.tokens),
    costUsd: meanDifference(cv.cost, rv.cost),
    verdict,
    reasons,
  };
}

const VERDICT_ORDER: Verdict[] = ['regresses', 'inconclusive', 'improves', 'no-difference'];
/** The worst of several verdicts; nothing compared at all is inconclusive, never a pass. */
export const worstVerdict = (verdicts: Verdict[]): Verdict => VERDICT_ORDER.find((v) => verdicts.includes(v)) ?? 'inconclusive';

/** The arm being judged: the candidate, or the released skill when there is no candidate. */
function subjectOf(arms: ArmSpec[]): ArmSpec | undefined {
  return arms.find((a) => a.id === 'candidate') ?? arms.find((a) => a.id === 'released');
}

/** Pairs to compare: the subject against each other arm. */
function pairsOf(arms: ArmSpec[]): Array<[ArmSpec, ArmSpec]> {
  const find = (id: string) => arms.find((a) => a.id === id);
  const subject = subjectOf(arms);
  if (!subject) return [];
  return ['released', 'baseline']
    .map(find)
    .filter((a): a is ArmSpec => !!a && a !== subject)
    .map((ref) => [ref, subject]);
}

function summarizePairs(arms: ArmSpec[], scenarios: ScenarioComparison[], reports: Record<string, EvalReport>): PairSummary[] {
  if (!scenarios.length) return [];
  return pairsOf(arms).map(([ref, cand]) => {
    const rows = scenarios.map((s) => ({ s, pair: s.pairs.find((p) => p.reference === ref.id && p.candidate === cand.id) })).filter((x) => x.pair);
    const pooled = (measure: 'completion' | 'activation') => {
      const sum = (arm: string): [number, number] =>
        rows
          .filter((x) => x.s.measure === measure)
          .reduce<[number, number]>((acc, x) => {
            const v = values(reports[arm]?.results.find((r) => r.skill === x.s.skill && r.scenario === x.s.scenario))[measure];
            return [acc[0] + v[0], acc[1] + v[1]];
          }, [0, 0]);
      const c = sum(cand.id);
      const r = sum(ref.id);
      return r[1] && c[1] ? { ...rateDelta(c, r), reference: rateOf(r), candidate: rateOf(c) } : null;
    };
    const all = (arm: string) =>
      rows.map((x) => values(reports[arm]?.results.find((r) => r.skill === x.s.skill && r.scenario === x.s.scenario))).reduce<Values>(
        (acc, v) => ({
          ...acc,
          asked: [acc.asked[0] + v.asked[0], acc.asked[1] + v.asked[1]],
          unexpected: [...acc.unexpected, ...v.unexpected],
          duration: [...acc.duration, ...v.duration],
          tokens: [...acc.tokens, ...v.tokens],
          cost: [...acc.cost, ...v.cost],
        }),
        values(undefined),
      );
    const cv = all(cand.id);
    const rv = all(ref.id);
    const completion = pooled('completion');
    const activation = pooled('activation');
    const reasons: string[] = [];
    const regressed = rows.filter((x) => x.pair!.verdict === 'regresses').map((x) => x.s.scenario);
    const inconclusive = rows.filter((x) => x.pair!.verdict === 'inconclusive').map((x) => x.s.scenario);
    const pooledVerdicts = [completion, activation].filter((d) => d !== null).map((d) => verdictOf(d!));
    let verdict: Verdict;
    if (!rows.length) {
      verdict = 'inconclusive';
      reasons.push(`nothing was compared against ${ref.id} (no scenario measures ${ref.id === 'baseline' ? 'task completion' : 'anything'} here)`);
    } else if (regressed.length || pooledVerdicts.includes('regresses')) {
      verdict = 'regresses';
      if (regressed.length) reasons.push(`regresses on ${regressed.join(', ')}`);
      if (pooledVerdicts.includes('regresses')) reasons.push('lower overall beyond the 95% interval');
    } else if (inconclusive.length) {
      verdict = 'inconclusive';
      reasons.push(`inconclusive on ${inconclusive.join(', ')}`);
    } else if (pooledVerdicts.includes('improves') || rows.some((x) => x.pair!.verdict === 'improves')) {
      verdict = 'improves';
    } else verdict = 'no-difference';
    return {
      reference: ref.id,
      candidate: cand.id,
      scenarios: rows.length,
      completion,
      activation,
      intervention: rateDelta(cv.asked, rv.asked),
      unexpectedChanges: meanDifference(cv.unexpected, rv.unexpected),
      durationMs: meanDifference(cv.duration, rv.duration),
      tokens: meanDifference(cv.tokens, rv.tokens),
      costUsd: meanDifference(cv.cost, rv.cost),
      verdict,
      reasons,
    };
  });
}

/** Task completion decides where it is measured (positive full-mode scenarios with criteria); activation elsewhere. */
export function comparisonMeasure(scenario: LoadedScenario, mode: 'activation' | 'full'): 'completion' | 'activation' {
  return mode === 'full' && scenario.assert.shouldActivate && (!!scenario.rubric?.length || !!scenario.interaction) ? 'completion' : 'activation';
}

export function compareSkillArms(input: {
  provider?: string;
  skill: string;
  seed: number;
  runs: number;
  mode: 'activation' | 'full';
  arms: ArmSpec[];
  tasks: ArmTask[];
  reports: Record<string, EvalReport>;
}): SkillComparison {
  const { arms, reports } = input;
  const find = (arm: string, task: ArmTask) => reports[arm]?.results.find((r) => r.skill === task.scenario.skill && r.scenario === task.scenario.name);
  const scenarios: ScenarioComparison[] = input.tasks.map((task) => {
    const measure = comparisonMeasure(task.scenario, input.mode);
    // Without the skill there is no activation to compare: the baseline only competes on task completion.
    const pairs = pairsOf(arms)
      .filter(([ref]) => ref.id !== 'baseline' || measure === 'completion')
      .map(([ref, cand]) => comparePair(ref, cand, find(ref.id, task), find(cand.id, task), measure));
    // Any arm that errored or did not run makes the whole scenario inconclusive,
    // including arms that no pair compares (a baseline on an activation scenario).
    const problems = arms.flatMap((a) => infrastructureReasons(a.id, find(a.id, task), values(find(a.id, task)), a.unavailable));
    for (const pair of pairs) {
      if (pair.verdict === 'regresses' || !problems.length) continue;
      pair.verdict = 'inconclusive';
      pair.reasons = [...new Set([...pair.reasons, ...problems])];
    }
    const subject = subjectOf(arms);
    const violations = subject ? values(find(subject.id, task)).violations : 0;
    const reasons = violations ? [`${subject!.id} broke a forbid rule (${violations} violation(s))`, ...problems] : problems;
    const verdicts = [...pairs.map((p) => p.verdict), ...(problems.length ? ['inconclusive' as const] : []), ...(violations ? ['regresses' as const] : [])];
    return {
      skill: task.scenario.skill,
      scenario: task.scenario.name,
      heldOut: task.scenario.heldOut === true,
      expected: task.scenario.assert.shouldActivate,
      measure,
      arms: arms.map((a) => armStats(a.id, find(a.id, task))),
      pairs,
      verdict: verdicts.length ? worstVerdict(verdicts) : null,
      reasons,
    };
  });
  const summary = {
    authoring: summarizePairs(arms, scenarios.filter((s) => !s.heldOut), reports),
    heldOut: summarizePairs(arms, scenarios.filter((s) => s.heldOut), reports),
  };
  // Scenario verdicts count too, so errors or unsafe runs outside any pair still fail the gate.
  const verdict = worstVerdict([
    ...[...summary.authoring, ...summary.heldOut].map((p) => p.verdict),
    ...scenarios.map((s) => s.verdict).filter((v): v is Verdict => v !== null),
  ]);
  return {
    kind: 'skill',
    provider: input.provider ?? Object.values(reports)[0]?.provider ?? '',
    skill: input.skill,
    seed: input.seed,
    runs: input.runs,
    mode: input.mode,
    arms: arms.map((a) => ({
      id: a.id,
      unavailable: a.unavailable ?? null,
      skill: reports[a.id]?.skills.find((s) => s.skill === input.skill && s.contentHash)
        ? (({ skill, version, contentHash, evalsHash }) => ({ skill, version, contentHash: contentHash!, evalsHash }))(reports[a.id]!.skills.find((s) => s.skill === input.skill)!)
        : null,
    })),
    reports,
    scenarios,
    summary,
    verdict,
    passed: verdict === 'improves' || verdict === 'no-difference',
  };
}

// ---------------------------------------------------------------------------
// Pack activation
// ---------------------------------------------------------------------------

export const NO_SKILL = '(none)';

export interface PackSkillActivation {
  skill: string;
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  precision: number | null;
  recall: number | null;
  /** Runs involving this skill that could not be scored. */
  errored: number;
}

export interface PackActivation {
  skills: string[];
  /** Rows: the skill each request belongs to (`(none)`: none should activate); columns: what activated (`(none)`: nothing). */
  matrix: Array<{ expected: string; runs: number; activated: Record<string, number> }>;
  perSkill: PackSkillActivation[];
  runs: number;
  erroredRuns: number;
}

/**
 * The skill a request belongs to: the scenario's skill for positives, the
 * named neighbor for negatives whose neighbor is installed, else none.
 */
function expectedSkill(r: ScenarioResult, skills: string[]): string | null {
  if (r.expected) return r.skill;
  return r.neighbor && skills.includes(r.neighbor) ? r.neighbor : null;
}

/** Which skill activated for which request, across every skill installed together. */
export function packActivation(report: EvalReport, skills: string[], include: (r: ScenarioResult) => boolean = () => true): PackActivation {
  const rows = new Map<string, { expected: string; runs: number; activated: Record<string, number> }>();
  const per = new Map(skills.map((s) => [s, { skill: s, truePositive: 0, falsePositive: 0, falseNegative: 0, errored: 0 }]));
  let runs = 0;
  let erroredRuns = 0;
  for (const r of report.results.filter((x) => x.status !== 'not-run' && include(x))) {
    const expected = expectedSkill(r, skills);
    for (const run of r.runs) {
      if (!run.activationObserved) {
        erroredRuns++;
        for (const s of new Set([r.skill, ...(expected ? [expected] : [])])) if (per.has(s)) per.get(s)!.errored++;
        continue;
      }
      runs++;
      const activated = [...(run.activated ? [r.skill] : []), ...run.otherActivations].filter((s) => skills.includes(s));
      const key = expected ?? NO_SKILL;
      const row = rows.get(key) ?? { expected: key, runs: 0, activated: Object.fromEntries([...skills, NO_SKILL].map((s) => [s, 0])) };
      row.runs++;
      if (activated.length) for (const s of activated) row.activated[s]!++;
      else row.activated[NO_SKILL]!++;
      rows.set(key, row);
      for (const s of skills) {
        const m = per.get(s)!;
        const hit = activated.includes(s);
        if (s === expected && hit) m.truePositive++;
        else if (s === expected) m.falseNegative++;
        else if (hit) m.falsePositive++;
      }
    }
  }
  const order = [...skills, NO_SKILL];
  return {
    skills,
    matrix: [...rows.values()].sort((a, b) => order.indexOf(a.expected) - order.indexOf(b.expected)),
    perSkill: [...per.values()].map((m) => ({
      ...m,
      precision: ratio(m.truePositive, m.truePositive + m.falsePositive),
      recall: ratio(m.truePositive, m.truePositive + m.falseNegative),
    })),
    runs,
    erroredRuns,
  };
}

export interface PackSkillDelta {
  skill: string;
  set: 'authoring' | 'held-out';
  precision: Delta & { without: number | null; with: number | null };
  recall: Delta & { without: number | null; with: number | null };
  verdict: Verdict;
  reasons: string[];
}

export interface PackComparison {
  kind: 'pack';
  provider: string;
  pack: string;
  /** Skills added in the `with` arm. */
  added: string[];
  /** Pack members replaced by a new copy in the `with` arm. */
  replaced: string[];
  seed: number;
  runs: number;
  arms: ArmDescription[];
  reports: Record<string, EvalReport>;
  activation: { without: PackActivation; with: PackActivation };
  heldOutActivation: { without: PackActivation; with: PackActivation };
  /** Existing pack skills: precision and recall with the new skills vs without. */
  skills: PackSkillDelta[];
  verdict: Verdict;
  /** Why the whole comparison regressed or is inconclusive, beyond the per-skill verdicts. */
  reasons: string[];
  passed: boolean;
}

function packSkillDelta(skill: string, set: PackSkillDelta['set'], without: PackActivation, withAdded: PackActivation): PackSkillDelta | null {
  const a = without.perSkill.find((m) => m.skill === skill)!;
  const b = withAdded.perSkill.find((m) => m.skill === skill)!;
  const recallN = [a.truePositive + a.falseNegative, b.truePositive + b.falseNegative];
  const precisionN = [a.truePositive + a.falsePositive, b.truePositive + b.falsePositive];
  if (!recallN[0] && !recallN[1] && !precisionN[0] && !precisionN[1] && !a.errored && !b.errored) return null;
  const recall = rateDelta([b.truePositive, recallN[1]!], [a.truePositive, recallN[0]!]);
  const precision = rateDelta([b.truePositive, precisionN[1]!], [a.truePositive, precisionN[0]!]);
  const reasons: string[] = [];
  let verdict: Verdict;
  if (a.errored || b.errored) {
    verdict = 'inconclusive';
    reasons.push(`${a.errored + b.errored} run(s) could not be scored`);
  } else {
    const verdicts = [recall, precision].filter((d) => d.ci95).map(verdictOf);
    if (verdictOf(recall) === 'regresses') reasons.push('recall drops beyond the 95% interval');
    if (verdictOf(precision) === 'regresses') reasons.push('precision drops beyond the 95% interval');
    verdict = verdicts.includes('regresses') ? 'regresses' : verdicts.includes('improves') ? 'improves' : 'no-difference';
  }
  return {
    skill,
    set,
    precision: { ...precision, without: a.precision, with: b.precision },
    recall: { ...recall, without: a.recall, with: b.recall },
    verdict,
    reasons,
  };
}

export function comparePackArms(input: {
  provider?: string;
  pack: string;
  existing: string[];
  added: string[];
  /** Pack members replaced by a new copy in the `with` arm. */
  replaced?: string[];
  seed: number;
  runs: number;
  arms: ArmSpec[];
  reports: Record<string, EvalReport>;
}): PackComparison {
  const { reports, existing, added } = input;
  const all = [...existing, ...added];
  const activation = (heldOut: boolean) => ({
    without: packActivation(reports.without!, existing, (r) => r.heldOut === heldOut),
    with: packActivation(reports.with!, all, (r) => r.heldOut === heldOut),
  });
  const authoring = activation(false);
  const heldOut = activation(true);
  // Existing skills are judged on the same requests in both arms: the pack's own scenarios, not the added skills'.
  const deltas = (set: PackSkillDelta['set'], heldOutSet: boolean) => {
    const without = packActivation(reports.without!, existing, (r) => r.heldOut === heldOutSet);
    const withAdded = packActivation(reports.with!, all, (r) => r.heldOut === heldOutSet && existing.includes(r.skill));
    return existing.map((s) => packSkillDelta(s, set, without, withAdded)).filter((d): d is PackSkillDelta => d !== null);
  };
  const skills = [...deltas('authoring', false), ...deltas('held-out', true)];
  // Errors anywhere (the added skills' own scenarios included) or nothing compared: inconclusive.
  // Unsafe behavior with the new skills installed is a regression.
  const unavailable = input.arms.filter((a) => a.unavailable);
  const errored = [authoring, heldOut].reduce((n, a) => n + a.without.erroredRuns + a.with.erroredRuns, 0);
  const violations = (reports.with?.results ?? []).reduce((n, r) => n + r.runs.reduce((m, x) => m + x.violations.length, 0), 0);
  const reasons: string[] = [];
  if (violations) reasons.push(`a forbid rule was broken ${violations} time(s) with ${[...added, ...(input.replaced ?? [])].join(', ')} installed`);
  if (unavailable.length) reasons.push(`${unavailable.map((a) => a.id).join(', ')} did not run`);
  if (errored) reasons.push(`${errored} run(s) could not be scored`);
  if (!skills.length) reasons.push('no existing skill was compared');
  const verdict: Verdict = violations ? 'regresses' : unavailable.length || errored || !skills.length ? 'inconclusive' : worstVerdict(skills.map((s) => s.verdict));
  return {
    kind: 'pack',
    provider: input.provider ?? Object.values(reports)[0]?.provider ?? '',
    pack: input.pack,
    added,
    replaced: input.replaced ?? [],
    seed: input.seed,
    runs: input.runs,
    arms: input.arms.map((a) => ({ id: a.id, unavailable: a.unavailable ?? null, skill: null })),
    reports,
    activation: authoring,
    heldOutActivation: heldOut,
    skills,
    verdict,
    reasons,
    passed: verdict === 'improves' || verdict === 'no-difference',
  };
}
