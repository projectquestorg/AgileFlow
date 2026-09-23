import path from 'node:path';
import {
  findGitRoot,
  findProjectRoot,
  globalScope,
  OperationError,
  projectScope,
  readGlobalConfig,
  readProjectConfig,
  type Context,
  type ScopeTarget,
} from '@agileflow/core';
import { allAdapters } from '@agileflow/providers';
import { createFetcher } from '@agileflow/registry';
import type { Services } from '@agileflow/core';
import type { Output } from './ui/output';
import type { Prompter } from './ui/prompts';

/** Documented exit codes. Never 2: stale v4 hooks treat 2 as "block the tool call". */
export const EXIT = {
  OK: 0,
  /** Error, invalid usage, or `check` found problems. */
  ERROR: 1,
  /** `update --non-interactive` skipped skills with local modifications. */
  SKIPPED_MODIFIED: 3,
} as const;

export interface Cli {
  ctx: Context;
  out: Output;
  prompter: Prompter;
}

export class UsageError extends Error {
  constructor(
    message: string,
    readonly hints: string[] = [],
  ) {
    super(message);
    this.name = 'UsageError';
  }
}

/** Project scope for commands that need an initialized project. */
export async function requireProjectScope(ctx: Context): Promise<ScopeTarget> {
  const root = await findProjectRoot(ctx.cwd);
  if (!root) {
    throw new OperationError(`No agileflow.yaml found in ${ctx.cwd} or its parents`, [
      'Run `agileflow init` to set up this project, or pass --global for personal skills.',
    ]);
  }
  return projectScope(root);
}

/** Where `init`/`add` should create a project: existing config, else git root, else cwd. */
export async function projectScopeForCreate(ctx: Context): Promise<ScopeTarget> {
  const existing = await findProjectRoot(ctx.cwd);
  if (existing) return projectScope(existing);
  return projectScope((await findGitRoot(ctx.cwd)) ?? path.resolve(ctx.cwd));
}

export async function scopeFor(ctx: Context, options: { global?: boolean }, create = false): Promise<ScopeTarget> {
  if (options.global) return globalScope(ctx);
  return create ? projectScopeForCreate(ctx) : requireProjectScope(ctx);
}

/** Wire the real fetcher and provider adapters, honoring the scope's registry setting. */
export async function servicesFor(ctx: Context, scope: ScopeTarget): Promise<Services> {
  let registry: string | undefined;
  let registryBase: string | undefined;
  try {
    if (scope.kind === 'project') {
      registry = (await readProjectConfig(scope.configPath))?.registry;
      registryBase = scope.root;
    }
    if (!registry) {
      const g = globalScope(ctx);
      registry = (await readGlobalConfig(g.configPath))?.registry;
      registryBase = path.dirname(g.configPath);
    }
  } catch {
    // Invalid config is reported by the command itself.
  }
  return { ctx, fetcher: createFetcher({ ctx, registry, registryBase }), adapters: allAdapters() };
}

export function scopeLabel(scope: ScopeTarget): string {
  return scope.kind === 'project' ? 'project' : 'personal (global)';
}

export function relSkillsDir(scope: ScopeTarget): string {
  return scope.kind === 'project' ? '.agents/skills' : '~/.agents/skills';
}

export function splitList(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
