import fs from 'node:fs';
import path from 'node:path';
import {
  parseSidecar,
  parseSkillMarkdown,
  readTextIfExists,
  SIDECAR_FILE,
  SKILL_FILE,
  validateSkillMarkdown,
} from '@agileflow/core';
import { loadScenarios } from './scenarios';

/** Size policy for official skills (lines in SKILL.md). */
export const SIZE_POLICY = { idealMin: 30, idealMax: 120, soft: 200, review: 300, max: 500 };

export interface LintIssue {
  level: 'error' | 'warning' | 'info';
  message: string;
}

export interface LintResult {
  skill: string;
  dir: string;
  lines: number;
  scenarios: number;
  negatives: number;
  issues: LintIssue[];
  passed: boolean;
}

/** Frontmatter keys an official skill may carry (portable Agent Skills fields only). */
const OFFICIAL_FRONTMATTER = new Set(['name', 'description']);

/**
 * Release gate for a skill (section "Skill release gate"): specific
 * description, small body, documented completion, 3+ evals including a
 * negative trigger, valid packaging metadata.
 */
export async function lintSkill(dir: string, options: { official?: boolean } = {}): Promise<LintResult> {
  const id = path.basename(dir);
  const issues: LintIssue[] = [];
  const text = await readTextIfExists(path.join(dir, SKILL_FILE));
  let lines = 0;
  let activation: 'auto' | 'manual' = 'auto';

  if (text === null) {
    issues.push({ level: 'error', message: `${SKILL_FILE} is missing` });
  } else {
    lines = text.split(/\r?\n/).length;
    for (const issue of validateSkillMarkdown(text, id)) {
      issues.push({ level: issue.level === 'error' ? 'error' : 'warning', message: issue.message });
    }
    let meta;
    try {
      meta = parseSkillMarkdown(text);
    } catch {
      meta = null;
    }
    if (meta) {
      if (options.official) {
        const extra = Object.keys(meta.frontmatter).filter((k) => !OFFICIAL_FRONTMATTER.has(k));
        if (extra.length) {
          issues.push({
            level: 'error',
            message: `official skills keep frontmatter portable (name, description only); found: ${extra.join(', ')}`,
          });
        }
      }
      const description = meta.description ?? '';
      if (description && !/\bwhen\b/i.test(description)) {
        issues.push({ level: 'error', message: 'description must say when to activate (e.g. "Use when ...")' });
      }
      if (description && description.length < 60) {
        issues.push({ level: 'warning', message: 'description is very short; it is routing logic, make it specific' });
      }
      if (!/^#{1,3}\s*(done when|completion)\b/im.test(meta.body)) {
        issues.push({ level: 'error', message: 'SKILL.md needs a "## Done when" section describing completion' });
      }
    }
    if (lines > SIZE_POLICY.max) {
      issues.push({ level: 'error', message: `${lines} lines exceeds the ${SIZE_POLICY.max}-line maximum` });
    } else if (lines > SIZE_POLICY.review) {
      issues.push({ level: 'warning', message: `${lines} lines: design review needed (move detail to references/ or scripts?)` });
    } else if (lines > SIZE_POLICY.soft) {
      issues.push({ level: 'warning', message: `${lines} lines is above the ${SIZE_POLICY.soft}-line soft limit` });
    } else if (lines < SIZE_POLICY.idealMin || lines > SIZE_POLICY.idealMax) {
      issues.push({ level: 'info', message: `${lines} lines (ideal ${SIZE_POLICY.idealMin}-${SIZE_POLICY.idealMax})` });
    }
  }

  const sidecarText = await readTextIfExists(path.join(dir, SIDECAR_FILE));
  if (sidecarText === null) {
    if (options.official) issues.push({ level: 'error', message: `${SIDECAR_FILE} is missing` });
  } else {
    try {
      const sidecar = parseSidecar(sidecarText);
      activation = sidecar.activation?.mode ?? 'auto';
      if (options.official && sidecar.package.name !== `@agileflow/${id}`) {
        issues.push({ level: 'error', message: `package.name must be @agileflow/${id}` });
      }
    } catch (err) {
      issues.push({ level: 'error', message: (err as Error).message });
    }
  }

  // Scripts must be referenced from SKILL.md so their purpose is documented.
  try {
    const scripts = await fs.promises.readdir(path.join(dir, 'scripts'));
    for (const script of scripts) {
      if (text && !text.includes(script)) {
        issues.push({ level: 'warning', message: `scripts/${script} is not referenced from ${SKILL_FILE}` });
      }
    }
  } catch {
    // no scripts
  }

  const { scenarios, errors } = await loadScenarios(dir);
  for (const e of errors) issues.push({ level: 'error', message: `eval ${e}` });
  const negatives = scenarios.filter((s) => !s.assert.shouldActivate);
  const positives = scenarios.filter((s) => s.assert.shouldActivate);
  if (scenarios.length < 3) issues.push({ level: 'error', message: `needs at least 3 eval scenarios (has ${scenarios.length})` });
  if (!negatives.length) issues.push({ level: 'error', message: 'needs at least 1 negative-trigger scenario (shouldActivate: false)' });
  if (!positives.length) issues.push({ level: 'error', message: 'needs at least 1 positive scenario (shouldActivate: true)' });
  if (positives.length && !positives.some((s) => s.rubric?.length)) {
    issues.push({ level: 'error', message: 'at least one positive scenario needs a behavioral rubric' });
  }
  for (const s of scenarios) {
    if (s.skill !== id) issues.push({ level: 'error', message: `eval ${path.basename(s.file)}: skill is "${s.skill}", expected "${id}"` });
    const base = path.basename(s.file).replace(/\.ya?ml$/, '');
    if (s.name !== base) issues.push({ level: 'error', message: `eval ${path.basename(s.file)}: name "${s.name}" must match the file name` });
    if (activation === 'manual' && s.assert.shouldActivate && s.invocation !== 'explicit') {
      issues.push({
        level: 'error',
        message: `eval ${s.name}: manual skills only activate on explicit invocation (set invocation: explicit)`,
      });
    }
  }

  return {
    skill: id,
    dir,
    lines,
    scenarios: scenarios.length,
    negatives: negatives.length,
    issues,
    passed: !issues.some((i) => i.level === 'error'),
  };
}

/** Skill directories (containing SKILL.md) directly under `catalogDir`. */
export async function listCatalog(catalogDir: string): Promise<string[]> {
  const entries = await fs.promises.readdir(catalogDir, { withFileTypes: true });
  const out: string[] = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    if (await readTextIfExists(path.join(catalogDir, e.name, SKILL_FILE))) out.push(path.join(catalogDir, e.name));
  }
  return out.sort();
}
