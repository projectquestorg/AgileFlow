import path from 'node:path';
import semver from 'semver';
import {
  findGitRoot,
  findProjectRoot,
  globalScope,
  isSameDir,
  OperationError,
  projectScope,
  readGlobalConfig,
  readProjectConfig,
  recoverInterruptedWrites,
  withScopeLock,
  type Context,
  type OperationEvent,
  type ScopeTarget,
} from '@agileflow/core';
import { adaptersFor } from '@agileflow/providers';
import { createFetcher } from '@agileflow/registry';
import type { Services } from '@agileflow/core';
import type { Output } from './ui/output';
import type { Prompter } from './ui/prompts';

/** Documented exit codes. Never 2: stale v4 hooks treat 2 as "block the tool call". */
export const EXIT = {
  OK: 0,
  /** Error, invalid usage, or `check`/`verify` found problems. */
  ERROR: 1,
  /**
   * A non-interactive `update` skipped skills that need a decision: local
   * modifications, or third-party changes that were not approved with --yes.
   */
  SKIPPED_MODIFIED: 3,
} as const;

export interface Cli {
  ctx: Context;
  out: Output;
  prompter: Prompter;
  /** Command name and arguments, for the operation history. */
  invocation?: { command: string; args: string[] };
  /** Filled by commands: what changed and what was approved (history). */
  record?: { scope?: ScopeTarget; changed?: string[]; approved?: string[] };
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

/** Nearest project root below the home directory (the home directory is never a project). */
export function findProject(ctx: Context): Promise<string | null> {
  return findProjectRoot(ctx.cwd, { homeDir: ctx.homeDir });
}

/** Project scope for commands that need an initialized project. */
export async function requireProjectScope(ctx: Context): Promise<ScopeTarget> {
  const root = await findProject(ctx);
  if (!root) {
    throw new OperationError(`No agileflow.yaml found in ${ctx.cwd} or its parents`, [
      'Run `agileflow init` to set up this project, or pass --global for personal skills.',
    ]);
  }
  return projectScope(root);
}

/** Where `init`/`add` should create a project: existing config, else git root, else cwd. */
export async function projectScopeForCreate(ctx: Context): Promise<ScopeTarget> {
  const existing = await findProject(ctx);
  if (existing) return projectScope(existing);
  const root = (await findGitRoot(ctx.cwd)) ?? path.resolve(ctx.cwd);
  if (isSameDir(root, ctx.homeDir, ctx.platform) || path.dirname(root) === root) {
    throw new UsageError(`Refusing to set up a project at ${root}`, [
      'Your home directory holds personal skills (~/.agents/skills); a project there would capture every repository below it.',
      'Use --global for personal skills, or run this inside a project directory.',
    ]);
  }
  return projectScope(root);
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
  return { ctx, fetcher: createFetcher({ ctx, registry, registryBase }), adapters: await adaptersFor(ctx, scope) };
}

/**
 * Refuse to change a project whose `agileflow:` requirement this CLI does not
 * meet, so an old CLI never rewrites files a newer one produced.
 */
export async function assertCliRequirement(scope: ScopeTarget, version: string): Promise<void> {
  if (scope.kind !== 'project') return;
  let range: string | undefined;
  try {
    range = (await readProjectConfig(scope.configPath))?.agileflow;
  } catch {
    return; // invalid config is reported by the command itself
  }
  if (!range || !semver.valid(version)) return;
  if (!semver.satisfies(version, range, { includePrerelease: true })) {
    throw new OperationError(`This project requires AgileFlow ${range}; you are running ${version}`, [
      'Upgrade: npm install -g agileflow@latest (or run `agileflow self-update`)',
    ]);
  }
}

/**
 * Run a command that changes a scope: hold the scope lock (so concurrent
 * commands cannot lose each other's updates), finish or roll back any write
 * an earlier crash interrupted, and enforce the project's CLI requirement.
 */
export async function mutate<T>(cli: Cli, scope: ScopeTarget, fn: () => Promise<T>): Promise<T> {
  const { cliVersion } = await import('./version');
  await assertCliRequirement(scope, cliVersion());
  cli.record = { ...(cli.record ?? {}), scope };
  return withScopeLock(
    cli.ctx,
    scope,
    async () => {
      const services = await servicesFor(cli.ctx, scope);
      printEvents(cli, await recoverInterruptedWrites(services, scope));
      return fn();
    },
    { command: `agileflow ${cli.invocation?.command ?? ''}`.trim() },
  );
}

export function printEvents(cli: Cli, events: OperationEvent[]): void {
  for (const e of events) {
    const text = `${e.skill ? `${e.skill}: ` : ''}${e.message}`;
    if (e.level === 'error') cli.out.error(text);
    else if (e.level === 'warn') cli.out.warn(text);
    else cli.out.line(text);
  }
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
