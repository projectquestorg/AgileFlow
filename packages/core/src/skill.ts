import YAML from 'yaml';
import { z } from 'zod';
import type { TreeFile } from './fs';

export const SKILL_FILE = 'SKILL.md';
export const SIDECAR_FILE = 'agileflow.skill.yaml';

/** Agent Skills naming rule: lowercase letters, digits, single hyphens, <= 64 chars. */
export const SKILL_NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_NAME_LENGTH = 64;
export const MAX_DESCRIPTION_LENGTH = 1024;

export interface SplitMarkdown {
  /** Raw frontmatter text (without the `---` fences), or null when absent. */
  frontmatter: string | null;
  body: string;
  eol: '\n' | '\r\n';
}

export function splitFrontmatter(text: string): SplitMarkdown {
  const eol: '\n' | '\r\n' = text.includes('\r\n') ? '\r\n' : '\n';
  const normalized = text.replace(/^﻿/, '');
  const match = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(normalized);
  if (!match) return { frontmatter: null, body: normalized, eol };
  return { frontmatter: match[1] ?? '', body: normalized.slice(match[0].length), eol };
}

export function joinFrontmatter(frontmatter: string, body: string, eol: '\n' | '\r\n' = '\n'): string {
  const fm = frontmatter.replace(/\r?\n$/, '');
  return `---${eol}${fm}${eol}---${eol}${body}`;
}

export interface SkillMetadata {
  name: string | null;
  description: string | null;
  frontmatter: Record<string, unknown>;
  body: string;
}

export function parseSkillMarkdown(text: string): SkillMetadata {
  const { frontmatter, body } = splitFrontmatter(text);
  let data: Record<string, unknown> = {};
  if (frontmatter !== null) {
    const parsed = YAML.parse(frontmatter);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    }
  }
  return {
    name: typeof data.name === 'string' ? data.name : null,
    description: typeof data.description === 'string' ? data.description : null,
    frontmatter: data,
    body,
  };
}

export interface SkillIssue {
  level: 'error' | 'warning';
  message: string;
}

/**
 * Validate the parts of SKILL.md every Agent Skills consumer relies on.
 * `expectedName` is the directory name the skill is installed under.
 */
export function validateSkillMarkdown(text: string, expectedName?: string): SkillIssue[] {
  const issues: SkillIssue[] = [];
  let meta: SkillMetadata;
  try {
    meta = parseSkillMarkdown(text);
  } catch (err) {
    return [{ level: 'error', message: `SKILL.md frontmatter is not valid YAML: ${(err as Error).message}` }];
  }
  if (splitFrontmatter(text).frontmatter === null) {
    issues.push({ level: 'error', message: 'SKILL.md is missing YAML frontmatter' });
    return issues;
  }
  if (!meta.name) {
    issues.push({ level: 'error', message: 'frontmatter is missing `name`' });
  } else {
    if (!SKILL_NAME_RE.test(meta.name) || meta.name.length > MAX_NAME_LENGTH) {
      issues.push({
        level: 'error',
        message: `name "${meta.name}" must be lowercase letters, digits, and single hyphens (max ${MAX_NAME_LENGTH})`,
      });
    }
    if (expectedName && meta.name !== expectedName) {
      issues.push({
        level: 'error',
        message: `name "${meta.name}" does not match its directory "${expectedName}"`,
      });
    }
  }
  if (!meta.description || !meta.description.trim()) {
    issues.push({ level: 'error', message: 'frontmatter is missing `description`' });
  } else if (meta.description.length > MAX_DESCRIPTION_LENGTH) {
    issues.push({
      level: 'error',
      message: `description is ${meta.description.length} characters (max ${MAX_DESCRIPTION_LENGTH})`,
    });
  }
  return issues;
}

// ---------------------------------------------------------------------------
// agileflow.skill.yaml sidecar
// ---------------------------------------------------------------------------

export const SidecarSchema = z
  .object({
    schema: z.literal(1),
    package: z
      .object({
        name: z.string().min(1),
        version: z.string().min(1),
      })
      .strict(),
    activation: z
      .object({ mode: z.enum(['auto', 'manual']).default('auto') })
      .strict()
      .optional(),
    requirements: z
      .object({
        commands: z.array(z.string()).default([]),
        network: z.enum(['none', 'optional', 'required']).default('none'),
      })
      .strict()
      .optional(),
    capabilities: z
      .object({
        modifiesFiles: z.enum(['no', 'possible', 'yes']).default('possible'),
        longRunning: z.boolean().default(false),
        userInteraction: z.enum(['none', 'optional', 'required']).default('none'),
      })
      .strict()
      .optional(),
    compatibility: z
      .object({ agentSkills: z.boolean().default(true) })
      .strict()
      .optional(),
  })
  .strict();

export type Sidecar = z.infer<typeof SidecarSchema>;

export function parseSidecar(text: string): Sidecar {
  const raw = YAML.parse(text);
  const result = SidecarSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid ${SIDECAR_FILE}: ${formatZodError(result.error)}`);
  }
  return result.data;
}

export function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length ? issue.path.join('.') : '(root)'}: ${issue.message}`)
    .join('; ');
}

/** Summary of a skill tree used by `add`, `list`, and trust prompts. */
export interface SkillSummary {
  name: string | null;
  description: string | null;
  sidecar: Sidecar | null;
  activation: 'auto' | 'manual';
  references: string[];
  scripts: string[];
  otherFiles: string[];
  lines: number;
}

export function summarizeTree(files: TreeFile[]): SkillSummary {
  const skillFile = files.find((f) => f.path === SKILL_FILE);
  const text = skillFile ? skillFile.content.toString('utf8') : '';
  let meta: SkillMetadata | null = null;
  try {
    meta = skillFile ? parseSkillMarkdown(text) : null;
  } catch {
    meta = null;
  }
  const sidecarFile = files.find((f) => f.path === SIDECAR_FILE);
  let sidecar: Sidecar | null = null;
  if (sidecarFile) {
    try {
      sidecar = parseSidecar(sidecarFile.content.toString('utf8'));
    } catch {
      sidecar = null;
    }
  }
  const references = files.filter((f) => f.path.startsWith('references/')).map((f) => f.path);
  const scripts = files
    .filter((f) => f.path.startsWith('scripts/') || (f.executable && f.path !== SKILL_FILE))
    .map((f) => f.path);
  const known = new Set([SKILL_FILE, SIDECAR_FILE, ...references, ...scripts]);
  const otherFiles = files
    .filter((f) => !known.has(f.path) && !f.path.startsWith('evals/'))
    .map((f) => f.path);
  return {
    name: meta?.name ?? null,
    description: meta?.description ?? null,
    sidecar,
    activation: sidecar?.activation?.mode ?? 'auto',
    references,
    scripts,
    otherFiles,
    lines: text ? text.split(/\r?\n/).length : 0,
  };
}
