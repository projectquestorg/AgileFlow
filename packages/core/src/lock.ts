import { AsyncLocalStorage } from 'node:async_hooks';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { Context } from './context';
import { isNotFound, isTransientFsError, removePath, withFsRetry } from './fs';
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

async function readLockText(file: string): Promise<string | null> {
  try {
    return await withFsRetry(() => fs.promises.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

function parseLockInfo(text: string | null): ScopeLockInfo | null {
  try {
    return text === null ? null : (JSON.parse(text) as ScopeLockInfo);
  } catch {
    return null;
  }
}

/**
 * Break a stale lock. Takeovers are serialized through `<lock>.break`
 * (created exclusively), and inside it the lock is removed only if it still
 * holds exactly the text that was judged stale. Nobody else can replace a
 * lock file while it exists (creation is exclusive and owners only remove
 * their own), so a fresh lock is never removed and nothing is ever put back.
 */
async function breakStaleLock(file: string, judged: string | null): Promise<void> {
  const guard = `${file}.break`;
  const me = JSON.stringify({ pid: process.pid, host: os.hostname(), at: new Date().toISOString() });
  try {
    await fs.promises.writeFile(guard, me, { flag: 'wx' });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST' && !isTransientFsError(err)) throw err;
    // Another waiter is breaking it. Clear a guard left by a breaker that died.
    const other = parseLockInfo(await readLockText(guard));
    if (await isStale(guard, other, 60_000)) await removePath(guard).catch(() => undefined);
    return;
  }
  try {
    if ((await readLockText(file)) === judged) await removePath(file);
  } finally {
    if ((await readLockText(guard)) === me) await removePath(guard);
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
 * Locks held by the current async call chain (lock file -> command): a nested
 * operation on the same scope (e.g. `init` offering `work init`) re-enters
 * instead of waiting on itself, while unrelated concurrent calls in the same
 * process still queue.
 */
const held = new AsyncLocalStorage<Map<string, string>>();

/** The command holding this scope's lock in the current call chain (recorded in crash journals). */
export function heldScopeCommand(ctx: Context, scope: ScopeTarget): string | undefined {
  return held.getStore()?.get(scopeLockPath(ctx, scope));
}

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
      // Windows reports a lock file that is being deleted as EPERM: wait like for a held lock.
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST' && !isTransientFsError(err)) throw err;
      const text = await readLockText(file);
      const holder = parseLockInfo(text);
      if ((err as NodeJS.ErrnoException).code === 'EEXIST' && (await isStale(file, holder, 10 * 60_000))) {
        await breakStaleLock(file, text);
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
    return await held.run(new Map([...(held.getStore() ?? []), [file, info.command]]), fn);
  } finally {
    const holder = parseLockInfo(await readLockText(file));
    if (holder && holder.pid === info.pid && holder.at === info.at) await removePath(file);
  }
}
