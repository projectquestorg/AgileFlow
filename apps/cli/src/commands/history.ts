import { globalScope, projectScope } from '@agileflow/core';
import type { Cli } from '../runtime';
import { EXIT, findProject, UsageError } from '../runtime';
import { readHistory } from '../history';
import { table } from '../ui/tables';

export interface HistoryOptions {
  global?: boolean;
  all?: boolean;
  limit?: string;
  json?: boolean;
}

/** `agileflow history`: what AgileFlow changed here, when, and what third-party content was approved. */
export async function runHistory(cli: Cli, options: HistoryOptions): Promise<number> {
  const { ctx, out } = cli;
  const limit = options.limit === undefined ? 20 : Number(options.limit);
  if (!Number.isInteger(limit) || limit < 1) throw new UsageError('--limit must be a positive whole number');
  let scope;
  if (!options.all) {
    const root = options.global ? null : await findProject(ctx);
    scope = root ? projectScope(root) : globalScope(ctx);
  }
  const entries = (await readHistory(ctx, { scope })).slice(-limit);
  if (options.json) {
    out.json({ ok: true, scope: scope ? { kind: scope.kind, root: scope.root } : 'all', entries });
    return EXIT.OK;
  }
  if (!entries.length) {
    out.line(ctx.env.AGILEFLOW_NO_HISTORY ? 'History is turned off (AGILEFLOW_NO_HISTORY).' : 'No AgileFlow changes recorded here yet.');
    return EXIT.OK;
  }
  out.lines(
    table(
      ['WHEN', 'COMMAND', 'RESULT', 'CHANGED'],
      entries.map((e) => [
        e.at.replace('T', ' ').slice(0, 19),
        ['agileflow', e.command, ...e.args].join(' ').slice(0, 60),
        e.exitCode === 0 ? 'ok' : `exit ${e.exitCode}`,
        (e.changed ?? []).join(', ').slice(0, 60),
      ]),
    ),
  );
  const approvals = entries.flatMap((e) => (e.approved ?? []).map((a) => `${e.at.slice(0, 19)} approved ${a}`));
  if (approvals.length) {
    out.line();
    out.heading('Third-party content approved:');
    out.lines(approvals.map((a) => `  ${a}`));
  }
  return EXIT.OK;
}
