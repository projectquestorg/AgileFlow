import {
  diffTrees,
  loadWorkspace,
  NEEDS_APPROVAL,
  readSkillTree,
  renderFor,
  updateWorkspace,
  type ConflictChoice,
  type PlannedUpdate,
  type Services,
  type UpdateConflict,
  type UpdatePlan,
  type Workspace,
} from '@agileflow/core';
import type { Cli } from '../runtime';
import { EXIT, mutate, scopeFor, servicesFor, UsageError } from '../runtime';
import { checkCliUpdate } from '../version';
import { printRisks, printSyncReport, syncReportJson } from './shared';

export interface UpdateOptions {
  global?: boolean;
  nonInteractive?: boolean;
  reset?: string[];
  dryRun?: boolean;
  yes?: boolean;
  json?: boolean;
}

function itemJson(item: PlannedUpdate) {
  return {
    id: item.id,
    kind: item.kind,
    ...(item.from ? { from: item.from } : {}),
    ...(item.to ? { to: item.to } : {}),
    status: item.status,
    ...(item.localOwned ? { localOwned: true } : {}),
    ...(item.external ? { external: true } : {}),
    ...(item.downgrade ? { downgrade: true } : {}),
    ...(item.risks?.length ? { risks: item.risks } : {}),
  };
}

/** What a third-party update would put in front of the agent: the diff of the installed copy vs the new one. */
async function externalDiff(services: Services, ws: Workspace, item: PlannedUpdate): Promise<string> {
  if (!item.pkg) return '';
  const current = (await readSkillTree(ws.scope, item.id)) ?? [];
  const activation = ws.specs[item.id]?.activation ?? ws.lock.resolved[item.id]?.activation ?? 'auto';
  const next = renderFor(services, ws, item.id, item.pkg, activation);
  return diffTrees(current, next, `${item.id}@${item.from ?? 'none'} (installed)`, `${item.id}@${item.to} (incoming)`);
}

function describePlan(plan: UpdatePlan): string[] {
  const lines: string[] = [];
  const width = Math.max(0, ...plan.items.map((i) => i.id.length));
  for (const item of plan.items) {
    const name = item.id.padEnd(width + 2);
    if (item.kind === 'add') lines.push(`  ${name}new -> ${item.to}`);
    else if (item.kind === 'remove') lines.push(`  ${name}remove (no longer in config)`);
    else if (item.localOwned) lines.push(`  ${name}now locally owned`);
    else {
      const notes = [
        ...(item.kind === 'source-change' ? ['source changed'] : []),
        ...(item.downgrade ? ['downgrade'] : []),
        ...(item.external ? ['third-party'] : []),
      ];
      lines.push(`  ${name}${item.from} -> ${item.to}${notes.length ? ` (${notes.join(', ')})` : ''}`);
    }
  }
  return lines;
}

export async function runUpdate(cli: Cli, ids: string[], options: UpdateOptions): Promise<number> {
  const { out } = cli;
  const interactive = cli.prompter.interactive && !options.nonInteractive;
  const scope = await scopeFor(cli.ctx, options);
  if (options.dryRun) return runUpdateBody(cli, ids, options, scope, interactive);
  return mutate(cli, scope, () => runUpdateBody(cli, ids, options, scope, interactive));
}

async function runUpdateBody(
  cli: Cli,
  ids: string[],
  options: UpdateOptions,
  scope: Awaited<ReturnType<typeof scopeFor>>,
  interactive: boolean,
): Promise<number> {
  const { out } = cli;
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

  let approveExternal = !!options.yes;
  const confirm = async (plan: UpdatePlan): Promise<boolean> => {
    out.line('Updates available:');
    out.lines(describePlan(plan));
    const external = plan.items.filter((i) => i.external);
    for (const item of external) {
      out.line();
      out.heading(`Third-party change: ${item.id} ${item.from ?? 'new'} -> ${item.to} (${ws.specs[item.id]?.source})`);
      if (item.risks) printRisks(cli, item.risks);
      if (interactive && !options.yes) out.line((await externalDiff(services, ws, item)) || '  (no content differences)');
    }
    if (external.length && !interactive && !options.yes) {
      out.line(`Third-party changes need approval and will be skipped: ${external.map((i) => i.id).join(', ')} (rerun with --yes)`);
    }
    const dirty = plan.items.filter((i) => i.status === 'modified');
    out.line(
      dirty.length
        ? `Locally modified: ${dirty.map((i) => i.id).join(', ')} (never overwritten without your choice)`
        : 'All managed skills are clean.',
    );
    if (!interactive || options.yes) return true;
    const ok = await cli.prompter.confirm(external.length ? 'Apply, including the third-party changes shown above?' : 'Apply?', !external.some((i) => i.risks?.some((r) => r.severity === 'high')));
    if (ok) approveExternal = true;
    else out.line('No changes made.');
    return ok;
  };

  cli.out.progress(`Checking ${ids.length || Object.keys(ws.specs).length} skill(s) for updates...`);
  const report = await updateWorkspace(services, ws, {
    ids,
    reset,
    decide,
    confirm,
    dryRun: options.dryRun,
    get approveExternal() {
      return approveExternal;
    },
  });
  cli.record = {
    ...(cli.record ?? {}),
    changed: report.applied.map((i) => i.id),
    approved: report.applied.filter((i) => i.external).map((i) => `${i.id}@${i.to} from ${ws.specs[i.id]?.source ?? ''}`),
  };

  const skippedModified = report.skipped.filter((s) => s.reason === 'local modifications');
  const needsApproval = report.skipped.filter((s) => s.reason === NEEDS_APPROVAL);
  const exitCode = report.events.some((e) => e.level === 'error') || report.sync?.events.some((e) => e.level === 'error')
    ? EXIT.ERROR
    : (skippedModified.length || needsApproval.length) && !interactive
      ? EXIT.SKIPPED_MODIFIED
      : EXIT.OK;
  if (options.json) {
    out.json({
      ok: exitCode === EXIT.OK,
      dryRun: !!options.dryRun,
      applied: report.applied.map(itemJson),
      skipped: report.skipped,
      forked: report.forked,
      upToDate: report.upToDate,
      forkNotices: report.forkNotices,
      events: report.events,
      sync: report.sync ? syncReportJson(report.sync) : null,
    });
    return exitCode;
  }

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

  for (const s of needsApproval) {
    out.line();
    out.line(`SKIPPED ${s.id}`);
    out.line(`Reason: ${NEEDS_APPROVAL}`);
    out.line('Review it, then apply:');
    out.line(`  agileflow update ${s.id} --dry-run`);
    out.line(`  agileflow update ${s.id} --yes`);
  }
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
  return exitCode;
}
