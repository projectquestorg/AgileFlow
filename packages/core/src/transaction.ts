import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { LockEntrySchema, SkillSpecSchema, type LockEntry, type SkillSpec } from './config';
import { OperationError, type OperationEvent } from './errors';
import { isNotFound, pathExists, readTree, removePath, renameWithRetry, siblingTempPath, writeFileAtomic, writeTree, type TreeFile } from './fs';
import { matchesRenderedHash, renderedHashOf } from './hash';
import { heldScopeCommand } from './lock';
import { classifyTarget, isReplaceable, sameSnapshot, snapshotSkill, type SkillSnapshot } from './ownership';
import { skillDir, type ScopeTarget } from './scope';
import { projectStateDir } from './state';
import { loadWorkspace, removeSkillSpecs, saveLock, setSkillSpecs, type Services, type Workspace } from './workspace';

/**
 * Crash-safe multi-skill writes.
 *
 * A skill is clean exactly when its directory hashes to the lock's
 * `renderedHash`, so directories and the lock must move together. A batch
 * goes through fixed steps, each recorded in a machine-local journal before
 * the next one starts:
 *
 * 1. Validate: every target is re-classified by the one ownership check
 *    (absent or AgileFlow's clean copy, or exactly what the caller saw when
 *    it planned) and its on-disk snapshot is recorded.
 * 2. Stage: every new directory is written next to its target. A failure
 *    here (disk full, permissions) changes nothing.
 * 3. Apply: per skill, re-read the target and compare it with the snapshot
 *    (an edit made since planning skips that skill), move it aside to a
 *    backup, move the staged copy in, and mark the item `swapped`.
 * 4. Record: write the config and lock for the swapped items, mark the
 *    journal `committed`, and only then delete the backups.
 *
 * If the process dies anywhere, the next mutating command rolls every
 * swapped item forward (the lock catches up), restores the backup of an
 * item caught between its two renames, and reports the items that were not
 * applied so the user can rerun the command. Nothing is inferred from names.
 */
export interface SkillWrite {
  id: string;
  /** Rendered files to install; `null` deletes the directory; omitted leaves files alone. */
  files?: TreeFile[] | null;
  /** Lock entry after the write, or null to drop the entry. */
  next: LockEntry | null;
  /** Config change for this skill: a spec to write, or 'remove'. */
  spec?: SkillSpec | 'remove';
  /**
   * What the caller saw on disk when it decided to replace or delete this
   * skill (`inspectSkill().snapshot`, `assertReplaceable().snapshot`). With
   * it, the skill is replaced only if it is still exactly that (this is how
   * an explicit reset or `remove --force` discards edits). Without it, only
   * an absent skill or AgileFlow's own clean copy (per the lock) is replaced.
   */
  expect?: SkillSnapshot;
  /** In-place change made once the journal is written (fork strips the managed notice). */
  touch?: () => Promise<void>;
}

export interface CommitResult {
  /** Skills whose files, lock entry, and config now agree with the write. */
  done: string[];
  /** Skills left exactly as they were because they changed after planning. */
  skipped: string[];
  events: OperationEvent[];
}

/** Points between writes where a batch can be interrupted (test seam, see `TransactionHooks`). */
export type WriteBoundary =
  | 'journal'
  | 'staging'
  | 'staged'
  | 'moved-aside'
  | 'moved-in'
  | 'swapped'
  | 'config'
  | 'lock'
  | 'committed'
  | 'cleaned';

/** Called at every write boundary of a batch so tests can simulate a crash exactly there. */
export interface TransactionHooks {
  boundary?(point: WriteBoundary, id?: string): Promise<void> | void;
}

const SnapshotSchema = z.union([
  z.object({ exists: z.literal(false) }),
  z.object({ exists: z.literal(true), hash: z.string(), unhashed: z.array(z.string()) }),
]);

const Progress = z.enum(['pending', 'staged', 'swapped', 'done', 'skipped']);

const JournalItemSchema = z.object({
  id: z.string(),
  action: z.enum(['write', 'delete', 'none']),
  previous: LockEntrySchema.nullable(),
  next: LockEntrySchema.nullable(),
  spec: z.union([SkillSpecSchema, z.literal('remove')]).nullable(),
  /** The target as validated; the swap happens only while it still is. */
  expected: SnapshotSchema.nullable(),
  /** `renderedHashOf` the files being written: identifies a completed swap after a crash. */
  content: z.string().nullable(),
  /** Sibling directory names in the skills directory (never inferred from names during recovery). */
  staging: z.string().nullable(),
  backup: z.string().nullable(),
  progress: Progress,
});

const JournalSchema = z.object({
  version: z.literal(2),
  root: z.string(),
  at: z.string(),
  /** The command that started the batch, for "rerun ..." hints. */
  command: z.string().optional(),
  /** staging: directories being written; applying: swapping; committed: lock and config written. */
  phase: z.enum(['staging', 'applying', 'committed']),
  items: z.array(JournalItemSchema),
});
type Journal = z.infer<typeof JournalSchema>;
type JournalItem = z.infer<typeof JournalItemSchema>;

/** Format written by CLIs before the journal recorded progress; recovered by content hash. */
const LegacyJournalSchema = z.object({
  version: z.literal(1),
  root: z.string(),
  at: z.string(),
  items: z.array(JournalItemSchema.pick({ id: true, action: true, previous: true, next: true, spec: true })),
});
type LegacyJournal = z.infer<typeof LegacyJournalSchema>;

export function journalPath(services: Pick<Services, 'ctx'>, scope: ScopeTarget): string {
  return path.join(projectStateDir(services.ctx, scope), 'transaction.json');
}

async function readJournal(file: string): Promise<Journal | LegacyJournal | null> {
  let raw: unknown;
  try {
    raw = JSON.parse(await fs.promises.readFile(file, 'utf8'));
  } catch (err) {
    if (isNotFound(err)) return null;
    if (!(err instanceof SyntaxError)) throw err;
  }
  const parsed = JournalSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const legacy = LegacyJournalSchema.safeParse(raw);
  if (legacy.success) return legacy.data;
  const version = (raw as { version?: unknown } | undefined)?.version;
  throw new OperationError(
    typeof version === 'number' && version > 2
      ? 'An interrupted operation was recorded by a newer AgileFlow version'
      : `The record of an interrupted operation is unreadable (${file})`,
    [
      typeof version === 'number' && version > 2
        ? 'Run the newer AgileFlow version once (any command that changes skills) so it can finish that operation.'
        : `Check your skills with \`agileflow list\`, then delete ${file} and run \`agileflow sync\`.`,
    ],
  );
}

async function writeJournal(file: string, journal: Journal): Promise<void> {
  await writeFileAtomic(file, JSON.stringify(journal, null, 2) + '\n');
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

const sibling = (scope: ScopeTarget, name: string | null) => (name ? path.join(scope.skillsDir, name) : null);

function driftEvent(id: string): OperationEvent {
  return { level: 'error', skill: id, message: 'changed since AgileFlow planned this update; nothing was replaced' };
}

/**
 * Put an item's previous directory back if it was moved aside. Returns false
 * when something else now occupies the target (the backup is kept).
 */
async function restoreBackup(scope: ScopeTarget, item: JournalItem): Promise<boolean> {
  const backup = sibling(scope, item.backup);
  if (!backup || !(await pathExists(backup))) return true;
  const target = skillDir(scope, item.id);
  if (await pathExists(target)) return false;
  await renameWithRetry(backup, target);
  return true;
}

/**
 * Write skill directories, then the lock and config, for every item that
 * succeeded. Items whose target changed since planning are skipped with an
 * error event. Throws the first apply failure after recording the completed
 * items; a failure while staging changes nothing.
 */
export async function commitSkillWrites(services: Services, ws: Workspace, writes: SkillWrite[]): Promise<CommitResult> {
  const result: CommitResult = { done: [], skipped: [], events: [] };
  if (!writes.length) return result;
  const hook = async (point: WriteBoundary, id?: string) => services.hooks?.boundary?.(point, id);
  const scope = ws.scope;

  // 1. Validate ownership against what the caller planned, and record what is there.
  const items: JournalItem[] = [];
  const byId = new Map<string, SkillWrite>();
  for (const w of writes) {
    const action = w.files ? 'write' : w.files === null ? 'delete' : 'none';
    let expected: SkillSnapshot | null = null;
    if (action !== 'none') {
      const target = await classifyTarget(scope, w.id, ws.lock.resolved[w.id]);
      if (w.expect ? !sameSnapshot(target.snapshot, w.expect) : !isReplaceable(target)) {
        result.skipped.push(w.id);
        result.events.push(driftEvent(w.id));
        continue;
      }
      expected = target.snapshot;
    }
    const dir = skillDir(scope, w.id);
    byId.set(w.id, w);
    items.push({
      id: w.id,
      action,
      previous: ws.lock.resolved[w.id] ?? null,
      next: w.next,
      spec: w.spec ?? null,
      expected,
      content: w.files ? renderedHashOf(w.files) : null,
      staging: action === 'write' ? path.basename(siblingTempPath(dir, 'new')) : null,
      backup: expected?.exists ? path.basename(siblingTempPath(dir, 'old')) : null,
      progress: 'pending',
    });
  }
  if (!items.length) return result;
  const file = journalPath(services, scope);
  const command = heldScopeCommand(services.ctx, scope);
  const journal: Journal = { version: 2, root: scope.root, at: new Date().toISOString(), ...(command ? { command } : {}), phase: 'staging', items };
  await writeJournal(file, journal);
  await hook('journal');

  // 2. Stage the whole batch before touching any installed skill.
  try {
    await fs.promises.mkdir(scope.skillsDir, { recursive: true });
    for (const item of items) {
      const staging = sibling(scope, item.staging);
      if (staging) {
        await writeTree(staging, byId.get(item.id)!.files!);
        await hook('staging', item.id);
      }
    }
  } catch (err) {
    for (const item of items) if (item.staging) await removePath(sibling(scope, item.staging)!);
    await removePath(file);
    throw withCommitted(err, []);
  }
  for (const item of items) item.progress = 'staged';
  journal.phase = 'applying';
  await writeJournal(file, journal);
  await hook('staged');

  // 3. Apply, re-checking each target immediately before it is replaced.
  let failure: unknown = null;
  for (const item of items) {
    const target = skillDir(scope, item.id);
    const staging = sibling(scope, item.staging);
    const backup = sibling(scope, item.backup);
    try {
      if (item.action !== 'none') {
        if (!sameSnapshot(await snapshotSkill(scope, item.id), item.expected!)) {
          item.progress = 'skipped';
          if (staging) await removePath(staging);
          await writeJournal(file, journal);
          result.skipped.push(item.id);
          result.events.push(driftEvent(item.id));
          continue;
        }
        if (backup) {
          await renameWithRetry(target, backup);
          await hook('moved-aside', item.id);
        }
        if (staging) {
          try {
            await renameWithRetry(staging, target);
          } catch (err) {
            if (!(await restoreBackup(scope, item))) throw err;
            await removePath(staging);
            throw err;
          }
          await hook('moved-in', item.id);
        }
      } else {
        await byId.get(item.id)!.touch?.();
      }
      item.progress = 'swapped';
      await writeJournal(file, journal);
      await hook('swapped', item.id);
    } catch (err) {
      failure = err;
      break;
    }
  }

  // 4. Record the swapped items, then drop backups now that the lock agrees.
  const swapped = items.filter((i) => i.progress === 'swapped');
  for (const item of swapped) applyInMemory(ws, item);
  await persistConfig(ws, swapped);
  await hook('config');
  await saveLock(ws);
  await hook('lock');
  for (const item of swapped) item.progress = 'done';
  journal.phase = 'committed';
  await writeJournal(file, journal);
  await hook('committed');
  let intact = true;
  for (const item of items) {
    if (item.progress === 'done') {
      if (item.backup) await removePath(sibling(scope, item.backup)!);
    } else {
      if (item.staging) await removePath(sibling(scope, item.staging)!);
      // Only an item whose rollback failed can still have its previous copy aside.
      if (!(await restoreBackup(scope, item).catch(() => false))) intact = false;
    }
  }
  await hook('cleaned');
  // Keep the journal while a previous copy is still aside: the next command restores it.
  if (intact) await removePath(file);
  result.done = swapped.map((i) => i.id);
  if (failure) throw withCommitted(failure, result.done);
  return result;
}

const COMMITTED = Symbol('agileflow.committed');

function withCommitted(err: unknown, done: string[]): unknown {
  if (err && typeof err === 'object') (err as { [COMMITTED]?: string[] })[COMMITTED] = done;
  return err;
}

/** Skills a failed `commitSkillWrites` did write and record (null when unknown). */
export function committedBefore(err: unknown): string[] | null {
  if (!err || typeof err !== 'object') return null;
  return (err as { [COMMITTED]?: string[] })[COMMITTED] ?? null;
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
 * Remove staging/backup leftovers of an interrupted directory swap that no
 * journal accounts for (an AgileFlow version before journaled backups, or a
 * lost journal). A backup whose skill directory is gone is moved back,
 * restoring the previous content instead of losing it. Names a journal
 * records are left to `recoverInterruptedWrites`.
 */
export async function sweepInterruptedSwaps(scope: ScopeTarget, referenced: Set<string> = new Set()): Promise<string[]> {
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
    if (!m || referenced.has(name)) continue;
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

function rerunHint(command: string | undefined): string {
  return command ? `rerun \`${command}\`` : 'rerun the command that was interrupted';
}

function listIds(ids: string[]): string {
  return ids.length === 1 ? ids[0]! : `${ids.slice(0, -1).join(', ')} and ${ids[ids.length - 1]}`;
}

/** True when the skill directory holds exactly the content the item was writing. */
async function holdsNext(scope: ScopeTarget, item: JournalItem): Promise<boolean> {
  try {
    return item.content !== null && renderedHashOf(await readTree(skillDir(scope, item.id))) === item.content;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

/**
 * Rename a backup that could not be restored to `.<id>.agileflow-kept-<time>`
 * (hidden, so skill listings ignore it; not matched by LITTER_RE, so no sweep
 * deletes it) and return its path.
 */
async function keepBackup(scope: ScopeTarget, item: JournalItem): Promise<string> {
  const from = sibling(scope, item.backup)!;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let to = path.join(scope.skillsDir, `.${item.id}.agileflow-kept-${stamp}`);
  for (let n = 1; await pathExists(to); n++) to = path.join(scope.skillsDir, `.${item.id}.agileflow-kept-${stamp}-${n}`);
  await renameWithRetry(from, to);
  return to;
}

/** Decide one journal item after a crash: roll it forward, or restore what was there. */
async function recoverItem(
  scope: ScopeTarget,
  journal: Journal,
  item: JournalItem,
): Promise<'adopt' | 'done' | 'not-applied' | 'restored' | 'kept-backup' | 'skipped'> {
  if (item.progress === 'done') return 'done';
  if (item.progress === 'skipped') return 'skipped';
  if (item.progress === 'swapped') return 'adopt';
  if (journal.phase === 'applying') {
    // Died between a rename and the journal update that would have recorded it.
    const staging = sibling(scope, item.staging);
    if (item.action === 'write' && !(await pathExists(staging!)) && (await holdsNext(scope, item))) return 'adopt';
    if (item.action === 'delete' && !(await pathExists(skillDir(scope, item.id)))) return 'adopt';
  }
  const backup = sibling(scope, item.backup);
  if (backup && (await pathExists(backup))) return (await restoreBackup(scope, item)) ? 'restored' : 'kept-backup';
  return 'not-applied';
}

/**
 * Finish or roll back a batch that was interrupted by a crash, from the
 * journal's per-item progress. Safe to call at the start of every mutating
 * command (under the scope lock); a no-op without a journal.
 */
export async function recoverInterruptedWrites(services: Services, scope: ScopeTarget): Promise<OperationEvent[]> {
  const events: OperationEvent[] = [];
  const file = journalPath(services, scope);
  const journal = await readJournal(file);
  if (journal?.version === 1) return recoverLegacy(services, scope, journal, file);
  const referenced = new Set(journal ? journal.items.flatMap((i) => [i.staging, i.backup]).filter((n): n is string => !!n) : []);
  if (journal) {
    const ws = await loadWorkspace(scope);
    const adopted: JournalItem[] = [];
    const notApplied: string[] = [];
    const restored: string[] = [];
    for (const item of journal.items) {
      const outcome = await recoverItem(scope, journal, item);
      if (outcome === 'adopt') adopted.push(item);
      else if (outcome === 'restored') restored.push(item.id);
      else if (outcome === 'not-applied') notApplied.push(item.id);
      else if (outcome === 'kept-backup') {
        // The previous copy may hold the user's work. Move it to a name the
        // litter sweep never touches before the journal that names it goes away.
        const kept = await keepBackup(scope, item);
        events.push({
          level: 'warn',
          skill: item.id,
          message: `an interrupted operation left the previous copy at ${kept}, and something else now exists at the skill path; compare them and keep the one you want`,
        });
        continue;
      }
      if (item.staging) await removePath(sibling(scope, item.staging)!);
    }
    for (const item of adopted) applyInMemory(ws, item);
    await persistConfig(ws, adopted);
    if (adopted.length) await saveLock(ws);
    // The lock now agrees with every adopted item: their previous copies can go.
    for (const item of journal.items) {
      if ((adopted.includes(item) || item.progress === 'done') && item.backup) await removePath(sibling(scope, item.backup)!);
    }
    if (adopted.length) {
      events.push({ level: 'warn', message: `completed an interrupted operation (${adopted.map((i) => i.id).join(', ')})` });
    }
    const pending = [...restored, ...notApplied];
    if (pending.length) {
      events.push({
        level: 'warn',
        message:
          `an interrupted operation did not get to ${listIds(pending)}` +
          `${restored.length ? ` (restored the previous copy of ${listIds(restored)})` : ''}; ${rerunHint(journal.command)} to apply ${pending.length === 1 ? 'it' : 'them'}`,
      });
    }
    await removePath(file);
  }
  for (const id of await sweepInterruptedSwaps(scope, referenced)) {
    events.push({ level: 'warn', skill: id, message: 'restored the previous copy after an interrupted update' });
  }
  return events;
}

/** Journals from CLIs that did not record progress: accept skills whose files already match the new lock entry. */
async function recoverLegacy(services: Services, scope: ScopeTarget, journal: LegacyJournal, file: string): Promise<OperationEvent[]> {
  const events: OperationEvent[] = [];
  for (const id of await sweepInterruptedSwaps(scope)) {
    events.push({ level: 'warn', skill: id, message: 'restored the previous copy after an interrupted update' });
  }
  const ws = await loadWorkspace(scope);
  const adopted: LegacyJournal['items'] = [];
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
      (item.action === 'write' && files !== null && matchesRenderedHash(files, item.next ?? undefined));
    if (finished) adopted.push(item);
    else {
      const unchanged =
        (item.previous === null && files === null) ||
        (files !== null && item.previous?.ownership === 'managed' && matchesRenderedHash(files, item.previous));
      if (!unchanged) {
        events.push({
          level: 'warn',
          skill: item.id,
          message: 'an interrupted operation left this skill in an unknown state; check it with `agileflow diff`',
        });
      }
    }
  }
  for (const item of adopted) applyInMemory(ws, item);
  await persistConfig(ws, adopted);
  if (adopted.length) {
    await saveLock(ws);
    events.push({ level: 'warn', message: `completed an interrupted operation (${adopted.map((i) => i.id).join(', ')})` });
  }
  await removePath(file);
  return events;
}

/**
 * Skills an unfinished batch may have left between two states, without
 * changing anything (for `list`, `check`, `diff`, `verify`). Null when no
 * operation is pending. Their files may already be new while the lock is
 * still old, so they must not be reported as modified or missing.
 */
export async function pendingSkillWrites(services: Pick<Services, 'ctx'>, scope: ScopeTarget): Promise<string[] | null> {
  let journal: Journal | LegacyJournal | null;
  try {
    journal = await readJournal(journalPath(services, scope));
  } catch {
    return [];
  }
  if (!journal) return null;
  if (journal.version === 2 && journal.phase === 'committed') return null;
  return journal.items
    .filter((i) => !('progress' in i) || (i.progress !== 'done' && i.progress !== 'skipped'))
    .map((i) => i.id);
}
