import { describeTrust, loadWorkspace, NEEDS_APPROVAL, resolvedSkills, syncWorkspace, type PendingApproval, type SyncReport } from '@agileflow/core';
import type { Cli } from '../runtime';
import { EXIT, mutate, scopeFor, servicesFor } from '../runtime';
import { mutationEnvelope } from '../ui/output';
import { printRisks, printSyncReport, syncReportJson } from './shared';

/** Versioned envelope for a sync report; the report's own keys stay for compatibility. */
function syncEnvelope(report: SyncReport, dryRun: boolean, extra: Record<string, unknown> = {}) {
  return mutationEnvelope('sync', {
    dryRun,
    applied: [...report.materialized, ...report.rerendered, ...report.disabled, ...report.removed],
    skipped: report.kept.map((k) => ({ id: k.id, reason: k.reason })),
    // Provider links and mirrors put back where they belong.
    repaired: report.exposure.results
      .filter((r) => r.change.kind !== 'warn' && r.outcome !== 'failed')
      .map((r) => ({ provider: r.change.provider, ...('skillId' in r.change && r.change.skillId ? { id: r.change.skillId } : {}), kind: r.change.kind })),
    // Link problems are warnings in text output too; they never fail a sync.
    warnings: report.exposure.results.flatMap((r) =>
      r.change.kind === 'warn' ? [r.change.message] : r.outcome === 'failed' ? [`${r.change.provider}: could not update ${r.change.path}: ${r.message}`] : [],
    ),
    events: report.events,
    extra: { ...syncReportJson(report), ...extra },
  });
}

export interface SyncOptions {
  global?: boolean;
  dryRun?: boolean;
  json?: boolean;
  /** Approve third-party content this machine has not installed before. */
  yes?: boolean;
}

/** Show what approving each pending third-party write means. */
function printPending(cli: Cli, pending: PendingApproval[]): void {
  for (const p of pending) {
    cli.out.line();
    cli.out.heading(`Third-party content not installed on this machine before: ${p.id} ${p.version} (${p.source}${p.resolved ? ` @ ${p.resolved.slice(0, 12)}` : ''})`);
    cli.out.line(p.trust.baseline === 'installed' ? 'What changes compared with the installed copy:' : 'What it brings:');
    cli.out.lines(describeTrust(p.trust).map((l) => `  ${l}`));
    if (p.trust.newRisks.length) printRisks(cli, p.trust.newRisks);
  }
}

/** Make the filesystem match agileflow.lock. No version resolution. */
export async function runSync(cli: Cli, options: SyncOptions): Promise<number> {
  const scope = await scopeFor(cli.ctx, options);
  const body = async () => {
    const services = await servicesFor(cli.ctx, scope);
    const ws = await loadWorkspace(scope);
    cli.out.progress(`Syncing ${Object.keys(ws.lock.resolved).length} skill(s)...`);
    const interactive = cli.prompter.interactive && !options.json;
    const report = await syncWorkspace(services, ws, {
      dryRun: options.dryRun,
      approveExternal: !!options.yes,
      ...(interactive
        ? {
            confirmExternal: async (pending: PendingApproval[]) => {
              printPending(cli, pending);
              return cli.prompter.confirm('Install this third-party content?', !pending.some((p) => p.trust.newRisks.some((r) => r.severity === 'high')));
            },
          }
        : {}),
    });
    const changed =
      report.materialized.length + report.rerendered.length + report.removed.length + report.disabled.length;
    cli.record = { ...(cli.record ?? {}), changed: [...report.materialized, ...report.rerendered, ...report.removed, ...report.disabled] };
    if (options.dryRun) {
      if (options.json) {
        cli.out.json(syncEnvelope(report, true));
        return EXIT.OK;
      }
      cli.out.line(changed || report.exposure.results.length ? 'Would change (dry run, nothing written):' : 'Already in sync.');
      printSyncReport(cli, ws, report);
      if (report.needsApproval?.length) printPending(cli, report.needsApproval);
      return EXIT.OK;
    }
    printSyncReport(cli, ws, report);
    // Lightweight check: what each active provider would report about the result.
    const skills = await resolvedSkills(ws);
    let problems = 0;
    const diagnostics = [];
    for (const provider of report.exposure.providers.filter((p) => p.active)) {
      const adapter = services.adapters.find((a) => a.id === provider.id)!;
      const pctx = { ctx: cli.ctx, scope, settings: ws.providerSettings[adapter.id] };
      for (const d of await adapter.validate(pctx, skills)) {
        if (d.level !== 'warn' && d.level !== 'error') continue;
        if (d.level === 'error') problems++;
        diagnostics.push({ provider: adapter.id, ...d });
        cli.out.diagnostic(d, '');
      }
    }
    const errors = report.events.filter((e) => e.level === 'error').length + problems;
    const total = Object.keys(ws.lock.resolved).length;
    const unapproved = report.needsApproval ?? [];
    const code = errors ? EXIT.ERROR : unapproved.length ? EXIT.SKIPPED_MODIFIED : EXIT.OK;
    if (options.json) {
      const envelope = syncEnvelope(report, false, { providerDiagnostics: diagnostics, ...(unapproved.length ? { needsApproval: unapproved } : {}) });
      cli.out.json({ ...envelope, ok: envelope.ok && code === EXIT.OK });
      return code;
    }
    if (unapproved.length && !interactive) printPending(cli, unapproved);
    for (const p of unapproved) {
      cli.out.line();
      cli.out.line(`SKIPPED ${p.id}`);
      cli.out.line(`Reason: ${NEEDS_APPROVAL}`);
      cli.out.line('Review it, then apply:');
      cli.out.line('  agileflow sync --dry-run');
      cli.out.line('  agileflow sync --yes');
    }
    cli.out.line(
      errors
        ? `Sync finished with ${errors} error(s).`
        : changed
          ? `Synced ${total} skill(s).`
          : unapproved.length
            ? `Nothing else to sync (${unapproved.length} skill(s) waiting for approval).`
            : `Already in sync (${total} skill(s)).`,
    );
    return code;
  };
  return options.dryRun ? body() : mutate(cli, scope, body);
}
