import fs from 'node:fs';
import path from 'node:path';
import {
  pathExists,
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

/** A skill in the catalog being linted, for trigger-conflict checks. */
export interface CatalogSkill {
  id: string;
  description: string;
}

export interface LintOptions {
  /**
   * Official catalog skill: the full release gate. Other skills (third-party
   * or your own) get the same checks, but missing gate items (evals,
   * completion section, sidecar) are warnings, not errors.
   */
  official?: boolean;
  /** The other skills installed alongside this one; enables the neighbor trigger-conflict check. */
  catalog?: CatalogSkill[];
  /** Fixture repositories directory; scenario `fixture` names must exist in it. */
  fixturesDir?: string;
}

const STOP_WORDS = new Set(
  'about after also asks before being does from have into just like make more most only other same some such than that their them then there these they this those uses using when where which while will with would your user skill'.split(' '),
);

function descriptionTerms(text: string): Set<string> {
  return new Set(
    (text.toLowerCase().match(/[a-z][a-z-]{3,}/g) ?? [])
      .map((w) => w.replace(/(ing|ed|es|s)$/, ''))
      .filter((w) => w.length >= 4 && !STOP_WORDS.has(w)),
  );
}

/** Jaccard similarity of two descriptions' content words (0-1). */
export function descriptionSimilarity(a: string, b: string): number {
  const ta = descriptionTerms(a);
  const tb = descriptionTerms(b);
  const shared = [...ta].filter((t) => tb.has(t)).length;
  const union = ta.size + tb.size - shared;
  return union === 0 ? 0 : shared / union;
}

/** Similarity at which two skills' descriptions compete for the same prompts. */
export const NEIGHBOR_THRESHOLD = 0.1;

/** Up to two catalog skills whose descriptions are closest to `id`'s (above NEIGHBOR_THRESHOLD). */
export function neighborSkills(id: string, catalog: CatalogSkill[]): string[] {
  const self = catalog.find((c) => c.id === id);
  if (!self) return [];
  return catalog
    .filter((c) => c.id !== id)
    .map((c) => ({ id: c.id, score: descriptionSimilarity(self.description, c.description) }))
    .filter((c) => c.score >= NEIGHBOR_THRESHOLD)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, 2)
    .map((c) => c.id);
}

/** Split `allowed-tools` into entries: whitespace or commas outside parentheses separate them. */
export function splitAllowedTools(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let current = '';
  for (const ch of value) {
    if (ch === '(') depth++;
    if (ch === ')') depth = Math.max(0, depth - 1);
    if (depth === 0 && (/\s/.test(ch) || ch === ',')) {
      if (current) out.push(current);
      current = '';
    } else current += ch;
  }
  if (current) out.push(current);
  return out;
}

const TOOL_ENTRY_RE = /^[A-Za-z][A-Za-z0-9_.-]*(\([^()]+\))?$/;

/** `allowed-tools` frontmatter: a string (space- or comma-separated) or a list of tool entries like `Read` or `Bash(git status:*)`. */
export function lintAllowedTools(value: unknown): LintIssue[] {
  const issues: LintIssue[] = [];
  let entries: string[];
  if (typeof value === 'string') entries = splitAllowedTools(value);
  else if (Array.isArray(value) && value.every((v) => typeof v === 'string')) entries = (value as string[]).flatMap((v) => splitAllowedTools(v));
  else {
    return [{ level: 'error', message: 'allowed-tools must be a string or a list of strings (e.g. "Read Bash(git status:*)")' }];
  }
  if (!entries.length) issues.push({ level: 'warning', message: 'allowed-tools is empty; remove it or list the tools the skill needs' });
  for (const entry of entries) {
    if (!TOOL_ENTRY_RE.test(entry)) {
      issues.push({ level: 'warning', message: `allowed-tools entry "${entry}" is not a tool name with an optional (specifier), e.g. Bash(npm test:*)` });
    }
  }
  issues.push({ level: 'info', message: 'allowed-tools is experimental in the Agent Skills spec; provider support varies' });
  return issues;
}

/**
 * Release gate for a skill (section "Skill release gate"): specific
 * description, small body, documented completion, 3+ evals including a
 * negative trigger, valid packaging metadata.
 */
export async function lintSkill(dir: string, options: LintOptions = {}): Promise<LintResult> {
  const id = path.basename(dir);
  const issues: LintIssue[] = [];
  /** Release-gate items: errors for official skills, warnings for everyone else. */
  const gate: LintIssue['level'] = options.official ? 'error' : 'warning';
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
      if (meta.frontmatter['allowed-tools'] !== undefined) issues.push(...lintAllowedTools(meta.frontmatter['allowed-tools']));
      const description = meta.description ?? '';
      if (description && !/\bwhen\b/i.test(description)) {
        issues.push({ level: gate, message: 'description must say when to activate (e.g. "Use when ...")' });
      }
      if (description && description.length < 60) {
        issues.push({ level: 'warning', message: 'description is very short; it is routing logic, make it specific' });
      }
      if (!/^#{1,3}\s*(done when|completion)\b/im.test(meta.body)) {
        issues.push({ level: gate, message: 'SKILL.md needs a "## Done when" section describing completion' });
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
    issues.push(
      options.official
        ? { level: 'error', message: `${SIDECAR_FILE} is missing` }
        : { level: 'warning', message: `${SIDECAR_FILE} is missing (optional outside the official catalog; defaults: auto activation, no declared requirements)` },
    );
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
  if (scenarios.length < 3) issues.push({ level: gate, message: `needs at least 3 eval scenarios in evals/ (has ${scenarios.length})` });
  if (!negatives.length) issues.push({ level: gate, message: 'needs at least 1 negative-trigger scenario (shouldActivate: false)' });
  if (!positives.length) issues.push({ level: gate, message: 'needs at least 1 positive scenario (shouldActivate: true)' });
  if (positives.length && !positives.some((s) => s.rubric?.length || s.interaction)) {
    issues.push({ level: gate, message: 'at least one positive scenario needs a behavioral rubric (or interaction success criteria)' });
  }
  const catalogIds = new Set((options.catalog ?? []).map((c) => c.id));
  for (const s of scenarios) {
    const file = path.basename(s.file);
    if (s.skill !== id) issues.push({ level: 'error', message: `eval ${file}: skill is "${s.skill}", expected "${id}"` });
    const base = file.replace(/\.ya?ml$/, '');
    if (s.name !== base) issues.push({ level: 'error', message: `eval ${file}: name "${s.name}" must match the file name` });
    if (activation === 'manual' && s.assert.shouldActivate && s.invocation !== 'explicit') {
      issues.push({
        level: 'error',
        message: `eval ${s.name}: manual skills only activate on explicit invocation (set invocation: explicit)`,
      });
    }
    if (s.kind === 'adversarial' && !s.forbid) {
      issues.push({ level: 'error', message: `eval ${s.name}: adversarial scenarios need forbid rules (commands, files, or output)` });
    }
    if (s.neighbor !== undefined) {
      if (s.neighbor === id) issues.push({ level: 'error', message: `eval ${s.name}: neighbor must be another skill, not "${id}"` });
      else if (s.assert.shouldActivate) {
        issues.push({ level: 'warning', message: `eval ${s.name}: neighbor only applies to negative scenarios (shouldActivate: false)` });
      } else if (options.catalog && !catalogIds.has(s.neighbor)) {
        issues.push({ level: 'warning', message: `eval ${s.name}: neighbor "${s.neighbor}" is not in the catalog` });
      }
    }
    if (s.fixture && options.fixturesDir && !(await pathExists(path.join(options.fixturesDir, s.fixture)))) {
      issues.push({ level: 'error', message: `eval ${s.name}: fixture "${s.fixture}" not found in ${options.fixturesDir}` });
    }
  }
  // Trigger conflicts: a skill whose description is close to another's needs a
  // negative scenario with a prompt that belongs to that neighbor.
  if (options.catalog) {
    const neighbors = neighborSkills(id, options.catalog);
    const covered = negatives.some((s) => s.neighbor && neighbors.includes(s.neighbor));
    if (neighbors.length && !covered) {
      issues.push({
        level: 'warning',
        message: `no negative scenario covers a neighboring skill (${neighbors.join(', ')}): add one whose prompt belongs to it, with neighbor: <id>`,
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

/** Descriptions of the skills in `dirs`, for trigger-conflict checks. */
export async function catalogSkills(dirs: string[]): Promise<CatalogSkill[]> {
  const out: CatalogSkill[] = [];
  for (const dir of dirs) {
    const text = await readTextIfExists(path.join(dir, SKILL_FILE));
    if (text === null) continue;
    try {
      out.push({ id: path.basename(dir), description: parseSkillMarkdown(text).description ?? '' });
    } catch {
      out.push({ id: path.basename(dir), description: '' });
    }
  }
  return out;
}

/**
 * Skill directories under `dir`: `dir` itself when it holds SKILL.md,
 * otherwise skills in common layouts (`<dir>/*`, `skills/*`, `.agents/skills/*`,
 * `.claude/skills/*`), so a repository of skills can be linted directly.
 */
export async function discoverSkillDirs(dir: string): Promise<string[]> {
  if ((await readTextIfExists(path.join(dir, SKILL_FILE))) !== null) return [dir];
  const found = new Set<string>();
  for (const sub of ['.', 'skills', path.join('.agents', 'skills'), path.join('.claude', 'skills')]) {
    const parent = path.join(dir, sub);
    if (!(await pathExists(parent))) continue;
    for (const skill of await listCatalog(parent)) found.add(skill);
  }
  return [...found].sort();
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
