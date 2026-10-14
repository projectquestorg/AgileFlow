/** Statistics for eval reports: confidence intervals and activation precision/recall/F1. */

export interface Interval {
  low: number;
  high: number;
}

/**
 * Wilson score interval for `successes` out of `n` trials (default 95%).
 * Well-behaved for small n and rates near 0 or 1, unlike the normal
 * approximation. `null` when there are no trials.
 */
export function wilsonInterval(successes: number, n: number, z = 1.96): Interval | null {
  if (n <= 0) return null;
  const p = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  const round = (v: number) => Math.round(v * 10000) / 10000;
  return { low: round(Math.max(0, center - half)), high: round(Math.min(1, center + half)) };
}

export interface Confusion {
  truePositive: number;
  falsePositive: number;
  falseNegative: number;
  trueNegative: number;
}

export interface ActivationMetrics extends Confusion {
  /** TP / (TP + FP): of the runs where the skill activated, how many should have. */
  precision: number | null;
  /** TP / (TP + FN): of the runs where the skill should activate, how many did. */
  recall: number | null;
  f1: number | null;
}

export function ratio(n: number, d: number): number | null {
  return d === 0 ? null : n / d;
}

export function activationMetrics(c: Confusion): ActivationMetrics {
  const precision = ratio(c.truePositive, c.truePositive + c.falsePositive);
  const recall = ratio(c.truePositive, c.truePositive + c.falseNegative);
  const f1 = precision === null || recall === null ? null : precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  return { ...c, precision, recall, f1 };
}

export function emptyConfusion(): Confusion {
  return { truePositive: 0, falsePositive: 0, falseNegative: 0, trueNegative: 0 };
}

/** Add one scored run: expected activation vs observed. */
export function tally(c: Confusion, expected: boolean, activated: boolean): void {
  if (expected && activated) c.truePositive++;
  else if (expected) c.falseNegative++;
  else if (activated) c.falsePositive++;
  else c.trueNegative++;
}

/**
 * Newcombe's hybrid score interval (method 10) for the difference of two
 * proportions `a - b`, built from their Wilson intervals. Better behaved than
 * the Wald interval for small samples and rates at 0 or 1. `null` when either
 * side has no trials.
 */
export function newcombeInterval(aSuccesses: number, aN: number, bSuccesses: number, bN: number, z = 1.96): Interval | null {
  const a = wilsonInterval(aSuccesses, aN, z);
  const b = wilsonInterval(bSuccesses, bN, z);
  if (!a || !b) return null;
  const pa = aSuccesses / aN;
  const pb = bSuccesses / bN;
  const d = pa - pb;
  const round = (v: number) => Math.round(v * 10000) / 10000;
  return {
    low: round(Math.max(-1, d - Math.sqrt((pa - a.low) ** 2 + (b.high - pb) ** 2))),
    high: round(Math.min(1, d + Math.sqrt((a.high - pa) ** 2 + (pb - b.low) ** 2))),
  };
}

/** Two-sided 95% Student t critical values by degrees of freedom (1-30); 1.96 beyond. */
const T95 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
export const t95 = (df: number) => (df >= 1 && df <= 30 ? T95[df - 1]! : 1.96);

/** A sample mean with its 95% t interval (interval null below two values). */
export interface MeanStat {
  n: number;
  mean: number | null;
  ci95: Interval | null;
}

function variance(values: number[], mean: number): number {
  return values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
}

export function meanStat(values: number[]): MeanStat {
  const n = values.length;
  if (!n) return { n, mean: null, ci95: null };
  const mean = values.reduce((s, v) => s + v, 0) / n;
  if (n < 2) return { n, mean, ci95: null };
  const half = (t95(n - 1) * Math.sqrt(variance(values, mean))) / Math.sqrt(n);
  return { n, mean, ci95: { low: mean - half, high: mean + half } };
}

/** Difference of means `a - b` with a Welch-style 95% interval (conservative df: min(n) - 1). */
export function meanDifference(a: number[], b: number[]): { delta: number | null; ci95: Interval | null } {
  if (!a.length || !b.length) return { delta: null, ci95: null };
  const ma = a.reduce((s, v) => s + v, 0) / a.length;
  const mb = b.reduce((s, v) => s + v, 0) / b.length;
  const delta = ma - mb;
  if (a.length < 2 || b.length < 2) return { delta, ci95: null };
  const se = Math.sqrt(variance(a, ma) / a.length + variance(b, mb) / b.length);
  const half = t95(Math.min(a.length, b.length) - 1) * se;
  return { delta, ci95: { low: delta - half, high: delta + half } };
}
