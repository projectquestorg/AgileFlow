import fs from 'node:fs';
import path from 'node:path';
import type { Context, ScopeTarget } from '@agileflow/core';

/**
 * Local operation history (`agileflow history`).
 *
 * One JSON line per command that changed something: when, where, what, the
 * outcome, and any third-party content the user approved. It lives in the
 * machine cache, never in the repository, and can be turned off with
 * AGILEFLOW_NO_HISTORY=1. The file is trimmed to the newest entries.
 */
export interface HistoryEntry {
  at: string;
  command: string;
  args: string[];
  cwd: string;
  scope?: { kind: string; root: string };
  exitCode: number;
  changed?: string[];
  /** Third-party skills the user explicitly approved (`id@version from source`). */
  approved?: string[];
  error?: string;
}

const MAX_ENTRIES = 1000;

export function historyPath(ctx: Context): string {
  return path.join(ctx.cacheDir, 'history.jsonl');
}

/** Drop values that could carry secrets (URLs with credentials, env assignments). */
export function redactArgs(args: string[]): string[] {
  return args.map((a) => a.replace(/(\w+:\/\/)[^/@\s]+@/g, '$1***@').replace(/^([A-Z_]*(?:TOKEN|KEY|SECRET|PASSWORD)[A-Z_]*=).*/i, '$1***'));
}

export async function appendHistory(ctx: Context, entry: HistoryEntry): Promise<void> {
  if (ctx.env.AGILEFLOW_NO_HISTORY === '1' || ctx.env.AGILEFLOW_NO_HISTORY === 'true') return;
  const file = historyPath(ctx);
  try {
    await fs.promises.mkdir(path.dirname(file), { recursive: true });
    await fs.promises.appendFile(file, JSON.stringify({ ...entry, args: redactArgs(entry.args) }) + '\n');
    const text = await fs.promises.readFile(file, 'utf8');
    const lines = text.split('\n').filter(Boolean);
    if (lines.length > MAX_ENTRIES * 1.2) {
      const tmp = `${file}.${process.pid}.tmp`;
      await fs.promises.writeFile(tmp, lines.slice(-MAX_ENTRIES).join('\n') + '\n');
      await fs.promises.rename(tmp, file);
    }
  } catch {
    // History is a convenience; never fail a command because of it.
  }
}

export async function readHistory(ctx: Context, filter: { scope?: ScopeTarget } = {}): Promise<HistoryEntry[]> {
  let text: string;
  try {
    text = await fs.promises.readFile(historyPath(ctx), 'utf8');
  } catch {
    return [];
  }
  const out: HistoryEntry[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line) as HistoryEntry;
      if (filter.scope && (entry.scope?.root !== filter.scope.root || entry.scope?.kind !== filter.scope.kind)) continue;
      out.push(entry);
    } catch {
      // skip a torn line
    }
  }
  return out;
}
