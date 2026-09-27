import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Context } from './context';
import { isNotFound } from './fs';
import { OperationError } from './errors';
import type { ScopeTarget } from './scope';
import { projectStateDir } from './state';

/**
 * Advisory lock for one scope (a project or personal skills).
 *
 * Every command that changes agileflow.yaml, agileflow.lock, or the skill
 * directories runs inside it, so two commands started at the same time (for
 * example by parallel agents in one checkout) cannot lose each other's
 * updates. The lock lives in the machine cache, never in the repository.
 */
export interface ScopeLockInfo {
  pid: number;
  host: string;
  command: string;
  at: string;
}

export function scopeLockPath(ctx: Context, scope: ScopeTarget): string {
  return path.join(projectStateDir(ctx, scope), 'lock');
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM: the process exists but belongs to someone else.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function readLockInfo(file: string): Promise<ScopeLockInfo | null> {
  try {
    return JSON.parse(await fs.promises.readFile(file, 'utf8')) as ScopeLockInfo;
  } catch {
    return null;
  }
}

/** A lock whose owner is gone (same host, dead pid) or that is unreadable and old. */
async function isStale(file: string, info: ScopeLockInfo | null, staleMs: number): Promise<boolean> {
  if (info && info.host === os.hostname()) return !processAlive(info.pid);
  try {
    const age = Date.now() - (await fs.promises.stat(file)).mtimeMs;
    return age > staleMs;
  } catch (err) {
    return isNotFound(err);
  }
}

export interface ScopeLockOptions {
  command?: string;
  /** How long to wait for another command to finish (default 30 s, `AGILEFLOW_LOCK_TIMEOUT` seconds). */
  timeoutMs?: number;
}

/**
 * Locks held by the current async call chain: a nested operation on the same
 * scope (e.g. `init` offering `work init`) re-enters instead of waiting on
 * itself, while unrelated concurrent calls in the same process still queue.
 */
const held = new AsyncLocalStorage<Set<string>>();

/** Run `fn` while holding the scope lock. Waits for a concurrent command, then fails clearly. */
export async function withScopeLock<T>(
  ctx: Context,
  scope: ScopeTarget,
  fn: () => Promise<T>,
  options: ScopeLockOptions = {},
): Promise<T> {
  const file = scopeLockPath(ctx, scope);
  if (held.getStore()?.has(file)) return fn();
  await fs.promises.mkdir(path.dirname(file), { recursive: true });
  const envTimeout = Number(ctx.env.AGILEFLOW_LOCK_TIMEOUT);
  const timeoutMs = options.timeoutMs ?? (Number.isFinite(envTimeout) && envTimeout >= 0 ? envTimeout * 1000 : 30_000);
  const info: ScopeLockInfo = {
    pid: process.pid,
    host: os.hostname(),
    command: options.command ?? 'agileflow',
    at: new Date().toISOString(),
  };
  const deadline = Date.now() + timeoutMs;
  let delay = 50;
  for (;;) {
    try {
      await fs.promises.writeFile(file, JSON.stringify(info) + '\n', { flag: 'wx' });
      break;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      const holder = await readLockInfo(file);
      if (await isStale(file, holder, 10 * 60_000)) {
        await fs.promises.rm(file, { force: true });
        continue;
      }
      if (Date.now() >= deadline) {
        throw new OperationError(
          `Another AgileFlow command is changing this ${scope.kind === 'project' ? 'project' : 'personal scope'}` +
            (holder ? ` (${holder.command}, pid ${holder.pid} on ${holder.host}, since ${holder.at})` : ''),
          [
            'Wait for it to finish and run your command again.',
            `If no AgileFlow command is running, delete ${file}.`,
          ],
        );
      }
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(delay * 2, 500);
    }
  }
  try {
    return await held.run(new Set([...(held.getStore() ?? []), file]), fn);
  } finally {
    const holder = await readLockInfo(file);
    if (holder && holder.pid === info.pid && holder.at === info.at) await fs.promises.rm(file, { force: true });
  }
}
