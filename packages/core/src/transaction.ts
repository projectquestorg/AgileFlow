import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { LockEntrySchema, SkillSpecSchema, type LockEntry, type SkillSpec } from './config';
import type { OperationEvent } from './errors';
import { isNotFound, pathExists, readTree, removePath, renameWithRetry, replaceDirAtomic, writeFileAtomic, type TreeFile } from './fs';
import { matchesRenderedHash } from './hash';
import { skillDir, type ScopeTarget } from './scope';
import { projectStateDir } from './state';
import { loadWorkspace, removeSkillSpecs, saveLock, setSkillSpecs, type Services, type Workspace } from './workspace';

/**
 * Crash-safe multi-skill writes.
 *
 * A skill is clean exactly when its directory hashes to the lock's
 * `renderedHash`, so directories and the lock must move together. Every
 * batch is recorded in a machine-local journal before any directory is
 * touched; the lock and config are written after the directories. If the
 * process dies in between, the next mutating command reads the journal and
 * rolls each skill forward (its directory already has the new content) or
 * leaves it at the previous state. A failure in the middle of a batch
 * records the skills that were written and leaves the rest untouched.
 */
export interface SkillWrite {
  id: string;
  /** Rendered files to install; `null` deletes the directory; omitted leaves files alone. */
  files?: TreeFile[] | null;
  /** Lock entry after the write, or null to drop the entry. */
  next: LockEntry | null;
  /** Config change for this skill: a spec to write, or 'remove'. */
  spec?: SkillSpec | 'remove';
}

const JournalItemSchema = z.object({
  id: z.string(),
  action: z.enum(['write', 'delete', 'none']),
  previous: LockEntrySchema.nullable(),
  next: LockEntrySchema.nullable(),
  spec: z.union([SkillSpecSchema, z.literal('remove')]).nullable(),
});

const JournalSchema = z.object({
  version: z.literal(1),
  root: z.string(),
  at: z.string(),
  items: z.array(JournalItemSchema),
});
type Journal = z.infer<typeof JournalSchema>;

export function journalPath(services: Services, scope: ScopeTarget): string {
  return path.join(projectStateDir(services.ctx, scope), 'transaction.json');
}

async function readJournal(file: string): Promise<Journal | null> {
  try {
    const parsed = JournalSchema.safeParse(JSON.parse(await fs.promises.readFile(file, 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch (err) {
    if (isNotFound(err) || err instanceof SyntaxError) return null;
    throw err;
  }
}

function applyInMemory(ws: Workspace, item: { id: string; next: LockEntry | null; spec?: SkillSpec | 'remove' | null }): void {
  if (item.next) ws.lock.resolved[item.id] = item.next;
  else delete ws.lock.resolved[item.id];
  if (item.spec === 'remove') delete ws.specs[item.id];
  else if (item.spec) ws.specs[item.id] = item.spec;
}

async function persistConfig(ws: Workspace, items: Array<{ id: string; spec?: SkillSpec | 'remove' | null }>): Promise<void> {
  const set: Record<string, SkillSpec> = {};
  const remove: string[] = [];
  for (const item of items) {
    if (item.spec === 'remove') remove.push(item.id);
    else if (item.spec) set[item.id] = item.spec;
  }
  if (Object.keys(set).length) {
    await setSkillSpecs(ws.scope, set);
    ws.configExists = true;
  }
  if (remove.length) await removeSkillSpecs(ws.scope, remove);
}

/**
 * Write skill directories, then the lock and config, for every item that
 * succeeded. Throws the first failure after recording the completed items.
 */
export async function commitSkillWrites(services: Services, ws: Workspace, writes: SkillWrite[]): Promise<void> {
  if (!writes.length) return;
  const file = journalPath(services, ws.scope);
  const journal: Journal = {
    version: 1,
    root: ws.scope.root,
    at: new Date().toISOString(),
    items: writes.map((w) => ({
      id: w.id,
      action: w.files ? 'write' : w.files === null ? 'delete' : 'none',
      previous: ws.lock.resolved[w.id] ?? null,
      next: w.next,
      spec: w.spec ?? null,
    })),
  };
  await writeFileAtomic(file, JSON.stringify(journal, null, 2) + '\n');
  const done: SkillWrite[] = [];
  let failure: unknown = null;
  for (const w of writes) {
    try {
      if (w.files) await replaceDirAtomic(skillDir(ws.scope, w.id), w.files);
      else if (w.files === null) await removePath(skillDir(ws.scope, w.id));
      done.push(w);
    } catch (err) {
      failure = err;
      break;
    }
  }
  for (const w of done) applyInMemory(ws, w);
  await persistConfig(ws, done);
  await saveLock(ws);
  await fs.promises.rm(file, { force: true });
  if (failure) throw failure;
}

const LITTER_RE = /^\.(.+)\.agileflow-(new|old|tmp)-(\d+)-[0-9a-f]{8}$/;

function processAlive(pid: number): boolean {
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/**
 * Remove staging/backup leftovers of an interrupted directory swap. A
 * backup whose skill directory is gone is moved back, restoring the
 * previous content instead of losing it.
 */
export async function sweepInterruptedSwaps(scope: ScopeTarget): Promise<string[]> {
  let names: string[];
  try {
    names = await fs.promises.readdir(scope.skillsDir);
  } catch (err) {
    if (isNotFound(err)) return [];
    throw err;
  }
  const restored: string[] = [];
  for (const name of names) {
    const m = LITTER_RE.exec(name);
    if (!m) continue;
    const [, id, kind, pid] = m;
    if (processAlive(Number(pid))) continue;
    const abs = path.join(scope.skillsDir, name);
    const target = path.join(scope.skillsDir, id!);
    if (kind === 'old' && !(await pathExists(target))) {
      await renameWithRetry(abs, target);
      restored.push(id!);
      continue;
    }
    await removePath(abs);
  }
  return restored;
}

/**
 * Finish or roll back a batch that was interrupted by a crash. Safe to call
 * at the start of every mutating command; a no-op without a journal.
 */
export async function recoverInterruptedWrites(services: Services, scope: ScopeTarget): Promise<OperationEvent[]> {
  const events: OperationEvent[] = [];
  const restored = await sweepInterruptedSwaps(scope);
  for (const id of restored) {
    events.push({ level: 'warn', skill: id, message: 'restored the previous copy after an interrupted update' });
  }
  const file = journalPath(services, scope);
  const journal = await readJournal(file);
  if (!journal) return events;
  const ws = await loadWorkspace(scope);
  const adopted: Journal['items'] = [];
  for (const item of journal.items) {
    let files: TreeFile[] | null = null;
    try {
      files = await readTree(skillDir(scope, item.id));
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
    const finished =
      item.action === 'none' ||
      (item.action === 'delete' && files === null) ||
      (item.action === 'write' && files !== null && matchesRenderedHash(files, item.next?.renderedHash));
    if (finished) {
      adopted.push(item);
      continue;
    }
    const unchanged =
      (item.previous === null && files === null) ||
      (files !== null && item.previous?.ownership === 'managed' && matchesRenderedHash(files, item.previous.renderedHash));
    if (!unchanged) {
      events.push({
        level: 'warn',
        skill: item.id,
        message: 'an interrupted operation left this skill in an unknown state; check it with `agileflow diff`',
      });
    }
  }
  for (const item of adopted) applyInMemory(ws, item);
  await persistConfig(ws, adopted);
  if (adopted.length) {
    await saveLock(ws);
    events.push({
      level: 'warn',
      message: `completed an interrupted operation (${adopted.map((i) => i.id).join(', ')})`,
    });
  }
  await fs.promises.rm(file, { force: true });
  return events;
}
