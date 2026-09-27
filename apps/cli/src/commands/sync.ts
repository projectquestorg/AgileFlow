import { loadWorkspace, resolvedSkills, syncWorkspace } from '@agileflow/core';
import type { Cli } from '../runtime';
import { EXIT, mutate, scopeFor, servicesFor } from '../runtime';
import { printSyncReport, syncReportJson } from './shared';

export interface SyncOptions {
  global?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

/** Make the filesystem match agileflow.lock. No version resolution. */
export async function runSync(cli: Cli, options: SyncOptions): Promise<number> {
  const scope = await scopeFor(cli.ctx, options);
  const body = async () => {
    const services = await servicesFor(cli.ctx, scope);
    const ws = await loadWorkspace(scope);
    cli.out.progress(`Syncing ${Object.keys(ws.lock.resolved).length} skill(s)...`);
    const report = await syncWorkspace(services, ws, { dryRun: options.dryRun });
    const changed =
      report.materialized.length + report.rerendered.length + report.removed.length + report.disabled.length;
    cli.record = { ...(cli.record ?? {}), changed: [...report.materialized, ...report.rerendered, ...report.removed, ...report.disabled] };
    if (options.dryRun) {
      if (options.json) {
        cli.out.json({ ok: true, dryRun: true, ...syncReportJson(report) });
        return EXIT.OK;
      }
      cli.out.line(changed || report.exposure.results.length ? 'Would change (dry run, nothing written):' : 'Already in sync.');
      printSyncReport(cli, ws, report);
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
    if (options.json) {
      cli.out.json({ ok: errors === 0, ...syncReportJson(report), providerDiagnostics: diagnostics });
      return errors ? EXIT.ERROR : EXIT.OK;
    }
    cli.out.line(changed ? `Synced ${total} skill(s).` : `Already in sync (${total} skill(s)).`);
    return errors ? EXIT.ERROR : EXIT.OK;
  };
  return options.dryRun ? body() : mutate(cli, scope, body);
}
