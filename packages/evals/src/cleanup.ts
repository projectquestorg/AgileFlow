import fs from 'node:fs';
import type { ChildProcess } from 'node:child_process';

/**
 * Resources an eval holds while it runs: provider and judge processes, and
 * isolated HOMEs (which hold copies of the user's logins) and sandboxes. An
 * interrupted eval (Ctrl-C, SIGTERM, an uncaught failure) calls
 * `disposeActive()` so none of them outlive the command. Once an abort has
 * begun, runs stop starting (`isAborting`) and anything created by a run
 * still unwinding is disposed as soon as it is tracked.
 */

const children = new Set<ChildProcess>();
/** Cleanups, with a directory that `disposeActiveSync` can delete when there is no time for the cleanup itself. */
const disposers = new Map<() => Promise<void>, string | undefined>();
let aborting = false;

export function isAborting(): boolean {
  return aborting;
}

/** Tests: start a new eval in the same process. */
export function resetAbort(): void {
  aborting = false;
}

export function trackChild(child: ChildProcess): void {
  if (aborting) {
    child.kill('SIGKILL');
    return;
  }
  children.add(child);
  child.once('close', () => children.delete(child));
  child.once('error', () => children.delete(child));
}

/**
 * Register a cleanup; the returned function unregisters it (call it once the
 * resource is released normally). `removeSync` is the directory to delete
 * synchronously if the process must exit before the cleanup can run.
 */
export function trackDisposer(dispose: () => Promise<void>, removeSync?: string): () => void {
  if (aborting) {
    void dispose().catch(() => undefined);
    return () => {};
  }
  disposers.set(dispose, removeSync);
  return () => disposers.delete(dispose);
}

/** Stop running provider/judge processes, then release every registered resource. Never throws. */
export async function disposeActive(options: { graceMs?: number } = {}): Promise<void> {
  aborting = true;
  const running = [...children];
  children.clear();
  await Promise.all(
    running.map(
      (child) =>
        new Promise<void>((resolve) => {
          if (child.exitCode !== null || child.signalCode !== null) return resolve();
          const timer = setTimeout(() => {
            child.kill('SIGKILL');
            resolve();
          }, options.graceMs ?? 2000);
          child.once('close', () => {
            clearTimeout(timer);
            resolve();
          });
          child.kill('SIGTERM');
        }),
    ),
  );
  // Each entry stays registered until its cleanup finished, so a second signal can still delete it synchronously.
  await Promise.allSettled(
    [...disposers.keys()].map((dispose) =>
      dispose()
        .catch(() => undefined)
        .finally(() => disposers.delete(dispose)),
    ),
  );
}

/**
 * Last resort before exiting (a second Ctrl-C): kill processes and delete
 * every tracked directory now. Refreshed logins are not written back.
 */
export function disposeActiveSync(): void {
  aborting = true;
  for (const child of children) child.kill('SIGKILL');
  children.clear();
  for (const dir of disposers.values()) {
    if (!dir) continue;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort: the process is exiting
    }
  }
  disposers.clear();
}
