import { loadWorkspace, resolvedSkills, syncWorkspace } from '@agileflow/core';
import type { Cli } from '../runtime';
import { EXIT, scopeFor, servicesFor } from '../runtime';
import { printSyncReport } from './shared';

export interface SyncOptions {
  global?: boolean;
}

/** Make the filesystem match agileflow.lock. No version resolution. */
export async function runSync(cli: Cli, options: SyncOptions): Promise<number> {
  const scope = await scopeFor(cli.ctx, options);
  const services = await servicesFor(cli.ctx, scope);
  const ws = await loadWorkspace(scope);
  const report = await syncWorkspace(services, ws);
  printSyncReport(cli, ws, report);
  // Lightweight check: what each active provider would report about the result.
  const skills = await resolvedSkills(ws);
  let problems = 0;
  for (const provider of report.exposure.providers.filter((p) => p.active)) {
    const adapter = services.adapters.find((a) => a.id === provider.id)!;
    const pctx = { ctx: cli.ctx, scope, settings: ws.providerSettings[adapter.id] };
    for (const d of await adapter.validate(pctx, skills)) {
      if (d.level !== 'warn' && d.level !== 'error') continue;
      if (d.level === 'error') problems++;
      cli.out.diagnostic(d, '');
    }
  }
  const errors = report.events.filter((e) => e.level === 'error').length + problems;
  const total = Object.keys(ws.lock.resolved).length;
  const changed =
    report.materialized.length + report.rerendered.length + report.removed.length + report.disabled.length;
  cli.out.line(changed ? `Synced ${total} skill(s).` : `Already in sync (${total} skill(s)).`);
  return errors ? EXIT.ERROR : EXIT.OK;
}
