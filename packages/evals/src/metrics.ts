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
