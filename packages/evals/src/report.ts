import type { LintResult } from './lint';
import type { Interval } from './metrics';
import type { EvalReport, PreferenceComparison, RunResult, ScenarioResult, ScenarioStatus } from './runner';

/**
 * Machine-readable eval report (`agileflow eval --json` / `--out`). The shape
 * is documented in the eval command docs; bump `schemaVersion` on any
 * breaking change (removed or renamed fields, changed meaning).
 */
export const REPORT_SCHEMA_VERSION = 1;

export interface ProviderColumnSummary {
  precision: number | null;
  recall: number | null;
  f1: number | null;
  passed: number;
  failed: number;
  errored: number;
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
    summary[column] = { precision: s.precision, recall: s.recall, f1: s.f1, passed: s.passed, failed: s.failed, errored: s.errored };
    for (const r of report.results) {
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
  return {
    status: run.status,
    error: run.error,
    activated: run.activated,
    otherActivations: run.otherActivations,
    passed: run.passed,
    askedUser: run.askedUser,
    askedSource: run.askedSource,
    usedStructuredQuestion: run.usedStructuredQuestion,
    interaction: run.interaction,
    rubric: run.rubric,
    violations: run.violations,
    fileChanges: run.fileChanges,
    visibleSkills: run.transcript.visibleSkills,
    foreignSkills: run.foreignSkills,
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

export interface JsonReportInput {
  lint: LintResult[];
  reports: EvalReport[];
  preferenceComparisons?: Array<PreferenceComparison & { provider: string }>;
  exitCode: number;
}

export function buildJsonReport(input: JsonReportInput) {
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    ok: input.exitCode === 0,
    exitCode: input.exitCode,
    lint: input.lint,
    reports: input.reports.map(serializeReport),
    providerComparison: compareProviders(input.reports),
    preferenceComparisons: input.preferenceComparisons ?? [],
  };
}

export type JsonReport = ReturnType<typeof buildJsonReport>;
