import fs from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { z } from 'zod';
import type { Context } from './context';
import { sha256Hex } from './hash';
import { isNotFound, writeFileAtomic } from './fs';
import type { ScopeTarget } from './scope';

/**
 * Machine-local record of what the last sync materialized for a scope.
 *
 * Lives outside the repository (`~/.cache/agileflow/projects/<hash>/`) so
 * the repo only carries agileflow.yaml, agileflow.lock, and skill files.
 * Used to clean up skills that disappeared from the lockfile (e.g. after
 * `git pull`) without guessing ownership from names.
 */
const SyncStateSchema = z.object({
  version: z.literal(1),
  root: z.string(),
  skills: z.record(
    z.string(),
    z.object({ path: z.string(), baseHash: z.string().optional() }),
  ),
});
export type SyncState = z.infer<typeof SyncStateSchema>;

export function projectStateDir(ctx: Context, scope: ScopeTarget): string {
  const key = sha256Hex(path.resolve(scope.root)).slice(0, 16);
  return path.join(ctx.cacheDir, 'projects', `${scope.kind}-${key}`);
}

export async function readSyncState(ctx: Context, scope: ScopeTarget): Promise<SyncState | null> {
  const file = path.join(projectStateDir(ctx, scope), 'state.json');
  try {
    const parsed = SyncStateSchema.safeParse(JSON.parse(await fs.promises.readFile(file, 'utf8')));
    return parsed.success ? parsed.data : null;
  } catch (err) {
    if (isNotFound(err) || err instanceof SyntaxError) return null;
    throw err;
  }
}

export async function writeSyncState(ctx: Context, scope: ScopeTarget, state: SyncState): Promise<void> {
  const file = path.join(projectStateDir(ctx, scope), 'state.json');
  await writeFileAtomic(file, JSON.stringify(state, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Provider patches (global, user-owned machine state)
// ---------------------------------------------------------------------------

const PatchSchema = z.object({
  file: z.string(),
  path: z.string(),
  previous: z.object({ existed: z.boolean(), value: z.unknown().optional() }),
  applied: z.unknown(),
  /** True when AgileFlow had to create the enclosing TOML table. */
  createdTable: z.boolean().optional(),
  /** True when AgileFlow created the file itself. */
  createdFile: z.boolean().optional(),
  at: z.string(),
});
export type ProviderPatch = z.infer<typeof PatchSchema>;

const GlobalStateSchema = z.object({
  version: z.literal(1),
  providerPatches: z.record(z.string(), z.array(PatchSchema)).default({}),
});
export type GlobalState = z.infer<typeof GlobalStateSchema>;

export function globalStatePath(ctx: Context): string {
  return path.join(ctx.configDir, 'state.yaml');
}

export async function readGlobalState(ctx: Context): Promise<GlobalState> {
  try {
    const raw = YAML.parse(await fs.promises.readFile(globalStatePath(ctx), 'utf8'));
    const parsed = GlobalStateSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
    throw new Error(`${globalStatePath(ctx)} is invalid; fix or delete it`);
  } catch (err) {
    if (isNotFound(err)) return { version: 1, providerPatches: {} };
    throw err;
  }
}

export async function writeGlobalState(ctx: Context, state: GlobalState): Promise<void> {
  const header =
    '# AgileFlow machine state. Records provider settings AgileFlow changed at your request\n' +
    '# so `agileflow configure` can restore their previous values exactly.\n';
  await writeFileAtomic(globalStatePath(ctx), header + YAML.stringify(state, { lineWidth: 0 }));
}
