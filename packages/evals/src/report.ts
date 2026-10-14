import type { PackActivation, PackComparison, SkillComparison } from './compare';
import type { LintResult } from './lint';
import type { Interval } from './metrics';
import type { EvalReport, PreferenceComparison, RunResult, ScenarioResult, ScenarioStatus } from './runner';

/**
 * Machine-readable eval report (`agileflow eval --json` / `--out`). The shape
 * is documented in the eval command docs; bump `schemaVersion` on any
 * breaking change (removed or renamed fields, changed meaning).
 *
 * 2: scenario status `error` became `inconclusive` (plus `not-run`), summary
 *    `errored` became `inconclusive`; ungraded judge criteria are inconclusive.
 */
export const REPORT_SCHEMA_VERSION = 2;

/** Raw transcript kept inline for errored runs (the full one is in `transcriptFile` when written). */
const RAW_TRANSCRIPT_LIMIT = 20000;

export interface ProviderColumnSummary {
  precision: number | null;
  recall: number | null;
  f1: number | null;
  passed: number;
  failed: number;
  inconclusive: number;
}

export interface ProviderComparisonRow {
  skill: string;
  scenario: string;
  kind: 'standard' | 'adversarial';
  /** Keyed by column (`provider`, or `provider[questionPreference]`). */
  results: Record<string, { status: ScenarioStatus; passRate: number | null; ci95: Interval | null } | null>;
}

export interface ProviderComparison {
  columns: string[];
  summary: Record<string, ProviderColumnSummary>;
  scenarios: ProviderComparisonRow[];
}

export function reportColumn(report: Pick<EvalReport, 'provider' | 'questionPreference'>): string {
  return report.questionPreference ? `${report.provider}[${report.questionPreference}]` : report.provider;
}

/** Side-by-side results of the same scenarios on several providers (null with fewer than two providers). */
export function compareProviders(reports: EvalReport[]): ProviderComparison | null {
  if (new Set(reports.map((r) => r.provider)).size < 2) return null;
  const columns = reports.map(reportColumn);
  const summary: Record<string, ProviderColumnSummary> = {};
  const rows = new Map<string, ProviderComparisonRow>();
  for (const report of reports) {
    const column = reportColumn(report);
    const s = report.summary;
    summary[column] = { precision: s.precision, recall: s.recall, f1: s.f1, passed: s.passed, failed: s.failed, inconclusive: s.inconclusive };
    for (const r of report.results) {
      if (r.status === 'not-run') continue;
      const key = `${r.skill}/${r.scenario}`;
      const row = rows.get(key) ?? { skill: r.skill, scenario: r.scenario, kind: r.kind, results: {} };
      row.results[column] = { status: r.status, passRate: r.passRate.rate, ci95: r.passRate.ci95 };
      rows.set(key, row);
    }
  }
  for (const row of rows.values()) for (const c of columns) row.results[c] ??= null;
  return { columns, summary, scenarios: [...rows.values()] };
}

function serializeRun(run: RunResult) {
  const raw = run.transcript.raw;
  return {
    status: run.status,
    error: run.error,
    activated: run.activated,
    activationObserved: run.activationObserved,
    provenance: run.provenance,
    otherActivations: run.otherActivations,
    passed: run.passed,
    askedUser: run.askedUser,
    askedSource: run.askedSource,
    usedStructuredQuestion: run.usedStructuredQuestion,
    interaction: run.interaction,
    rubric: run.rubric,
    violations: run.violations,
    fileChanges: run.fileChanges,
    unexpectedChanges: run.unexpectedChanges,
    usage: run.transcript.usage ?? null,
    visibleSkills: run.transcript.visibleSkills,
    foreignSkills: run.foreignSkills,
    taskCompleted: run.taskCompleted,
    judgeReply: run.judgeReply,
    transcriptFile: run.transcriptFile,
    // Errored runs keep their evidence inline even without a transcript file.
    ...(run.status === 'error' && raw
      ? { rawTranscript: raw.length > RAW_TRANSCRIPT_LIMIT ? `${raw.slice(0, RAW_TRANSCRIPT_LIMIT)}\n...[truncated]` : raw }
      : {}),
    model: run.transcript.model ?? null,
    sandbox: run.sandbox,
    exitCode: run.transcript.exitCode,
    durationMs: run.transcript.durationMs,
    toolCalls: run.transcript.toolCalls,
    finalText: run.transcript.finalText,
  };
}

function serializeScenario(r: ScenarioResult) {
  const { runs, ...rest } = r;
  return { ...rest, runs: runs.map(serializeRun) };
}

export function serializeReport(report: EvalReport) {
  return { ...report, results: report.results.map(serializeScenario) };
}

/** A problem found before any provider run; any one stops the eval. */
export interface PreflightIssue {
  /** `skill/scenario`, a skill id, or a flag. */
  subject: string;
  message: string;
}

/** Pack activation across every skill installed together (`--pack` without `--compare`). */
export interface PackActivationReport {
  pack: string;
  provider: string;
  authoring: PackActivation;
  heldOut: PackActivation;
}

function serializeComparison(c: SkillComparison | PackComparison) {
  return { ...c, reports: Object.fromEntries(Object.entries(c.reports).map(([arm, r]) => [arm, serializeReport(r)])) };
}

export interface JsonReportInput {
  lint: LintResult[];
  reports: EvalReport[];
  preferenceComparisons?: Array<PreferenceComparison & { provider: string }>;
  exitCode: number;
  /** false while runs are still going or after an interruption. Default true. */
  complete?: boolean;
  /** Signal or failure that stopped the eval early. */
  interrupted?: string | null;
  preflight?: PreflightIssue[];
  agileflowVersion?: string | null;
  comparisons?: Array<SkillComparison | PackComparison>;
  packActivation?: PackActivationReport[];
}

export function buildJsonReport(input: JsonReportInput) {
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    ok: input.exitCode === 0 && input.complete !== false,
    exitCode: input.exitCode,
    complete: input.complete ?? true,
    interrupted: input.interrupted ?? null,
    agileflowVersion: input.agileflowVersion ?? null,
    preflight: input.preflight ?? [],
    lint: input.lint,
    reports: input.reports.map(serializeReport),
    providerComparison: compareProviders(input.reports),
    comparisons: (input.comparisons ?? []).map(serializeComparison),
    packActivation: input.packActivation ?? [],
    preferenceComparisons: input.preferenceComparisons ?? [],
  };
}

export type JsonReport = ReturnType<typeof buildJsonReport>;
