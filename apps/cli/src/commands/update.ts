import { loadWorkspace, updateWorkspace, type ConflictChoice, type UpdateConflict, type UpdatePlan } from '@agileflow/core';
import type { Cli } from '../runtime';
import { EXIT, scopeFor, servicesFor, UsageError } from '../runtime';
import { checkCliUpdate } from '../version';
import { printSyncReport } from './shared';

export interface UpdateOptions {
  global?: boolean;
  nonInteractive?: boolean;
  reset?: string[];
  dryRun?: boolean;
  yes?: boolean;
}

function describePlan(plan: UpdatePlan): string[] {
  const lines: string[] = [];
  const width = Math.max(0, ...plan.items.map((i) => i.id.length));
  for (const item of plan.items) {
    const name = item.id.padEnd(width + 2);
    if (item.kind === 'add') lines.push(`  ${name}new -> ${item.to}`);
    else if (item.kind === 'remove') lines.push(`  ${name}remove (no longer in config)`);
    else if (item.localOwned) lines.push(`  ${name}now locally owned`);
    else lines.push(`  ${name}${item.from} -> ${item.to}${item.kind === 'source-change' ? ' (source changed)' : ''}`);
  }
  return lines;
}

export async function runUpdate(cli: Cli, ids: string[], options: UpdateOptions): Promise<number> {
  const { out } = cli;
  const interactive = cli.prompter.interactive && !options.nonInteractive;
  const scope = await scopeFor(cli.ctx, options);
  const services = await servicesFor(cli.ctx, scope);
  const ws = await loadWorkspace(scope);
  const reset = options.reset ?? [];
  for (const id of reset) {
    if (!ws.specs[id]) throw new UsageError(`--reset ${id}: not in ${scope.kind === 'project' ? 'agileflow.yaml' : 'your personal config'}`);
  }
  const notice = checkCliUpdate(cli.ctx.env);

  const decide = interactive
    ? async (conflict: UpdateConflict): Promise<ConflictChoice> => {
        out.line();
        out.line(`${conflict.id} has local modifications.`);
        out.line('Upstream:');
        out.line(`  ${conflict.from} -> ${conflict.to}`);
        for (;;) {
          const choice = await cli.prompter.select(
            'Choose:',
            [
              { value: 'fork', label: 'Fork', hint: 'keep your customized skill and stop tracking upstream' },
              { value: 'reset', label: 'Reset', hint: `discard local edits and install ${conflict.to}` },
              { value: 'skip', label: 'Skip', hint: 'leave this skill unchanged for now' },
              { value: 'diff', label: 'Diff', hint: 'compare your copy with the installed base and new upstream' },
            ],
            'skip',
          );
          if (choice !== 'diff') return choice;
          out.heading(`Your changes (installed ${conflict.from} -> current):`);
          out.line((await conflict.localDiff()) || '  (no differences)');
          out.heading(`Upstream changes (${conflict.from} -> ${conflict.to}):`);
          out.line((await conflict.upstreamDiff()) || '  (no differences)');
        }
      }
    : undefined;

  const confirm = async (plan: UpdatePlan): Promise<boolean> => {
    out.line('Updates available:');
    out.lines(describePlan(plan));
    const dirty = plan.items.filter((i) => i.status === 'modified');
    out.line(
      dirty.length
        ? `Locally modified: ${dirty.map((i) => i.id).join(', ')} (never overwritten without your choice)`
        : 'All managed skills are clean.',
    );
    if (!interactive || options.yes) return true;
    return cli.prompter.confirm('Apply?', true);
  };

  const report = await updateWorkspace(services, ws, {
    ids,
    reset,
    decide,
    confirm,
    dryRun: options.dryRun,
  });

  if (options.dryRun) {
    if (report.applied.length) {
      out.line('Would update:');
      out.lines(describePlan({ items: report.applied, upToDate: [], forkNotices: [], events: [] }));
    } else {
      out.line('Everything is up to date.');
    }
  } else if (!report.applied.length && !report.skipped.length && !report.forked.length) {
    out.line('Everything is up to date.');
  } else {
    for (const item of report.applied) {
      if (item.kind === 'remove') out.line(`Removed ${item.id}`);
      else if (item.localOwned) out.line(`${item.id} is now locally owned`);
      else out.line(`Updated ${item.id}${item.from ? ` ${item.from} ->` : ''} ${item.to}`);
    }
    for (const id of report.forked) out.line(`Forked ${id}; AgileFlow will no longer overwrite it.`);
  }
  for (const e of report.events) {
    if (e.level === 'error') out.error(`${e.skill ? `${e.skill}: ` : ''}${e.message}`);
    else out.warn(`${e.skill ? `${e.skill}: ` : ''}${e.message}`);
  }
  if (report.sync) printSyncReport(cli, ws, { ...report.sync, materialized: [], rerendered: [] });
  for (const n of report.forkNotices) {
    out.line();
    out.line(`Your fork ${n.id} originated from ${n.forkedFrom}.`);
    out.line(`Upstream is now ${n.latest}.`);
    out.line('Run:');
    out.line(`  agileflow diff ${n.id} --upstream`);
  }

  const skippedModified = report.skipped.filter((s) => s.reason === 'local modifications');
  if (skippedModified.length) {
    for (const s of skippedModified) {
      out.line();
      out.line(`SKIPPED ${s.id}`);
      out.line('Reason: local modifications');
      out.line('Run locally:');
      out.line(`  agileflow diff ${s.id}`);
      out.line(`  agileflow fork ${s.id}`);
      out.line('or');
      out.line(`  agileflow update --reset ${s.id}`);
    }
  }
  const msg = await notice;
  if (msg) {
    out.line();
    out.line(msg);
  }
  if (report.events.some((e) => e.level === 'error')) return EXIT.ERROR;
  if (skippedModified.length && !interactive) return EXIT.SKIPPED_MODIFIED;
  return EXIT.OK;
}
