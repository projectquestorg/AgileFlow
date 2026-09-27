import {
  checkScope,
  globalScope,
  pathExists,
  planMigration,
  projectScope,
  readProjectConfig,
  type CheckReport,
  type ScopeTarget,
} from '@agileflow/core';
import path from 'node:path';
import type { Cli } from '../runtime';
import { EXIT, findProject, mutate, servicesFor } from '../runtime';
import { syncReportJson } from './shared';
import { workCheckSection } from './work';

export interface CheckOptions {
  global?: boolean;
  verbose?: boolean;
  fix?: boolean;
  json?: boolean;
}

function printReport(cli: Cli, report: CheckReport, verbose: boolean, title: string | null): number {
  const { out } = cli;
  if (title) out.heading(title);
  let problems = 0;
  for (const section of report.sections) {
    const visible = section.diagnostics.filter((d) => verbose || !d.verboseOnly);
    if (!visible.length) continue;
    out.line(section.title);
    for (const d of visible) {
      out.diagnostic(verbose || !d.verboseOnly ? d : { ...d, detail: undefined });
      if (d.level === 'error') problems++;
    }
  }
  if (report.fixed) {
    const f = report.fixed;
    const repaired = [...f.materialized, ...f.rerendered];
    const links = f.exposure.results.filter((r) => r.outcome === 'done' && r.change.kind !== 'warn').length;
    out.line('Fixed');
    out.line(`  restored skills: ${repaired.length ? repaired.join(', ') : 'none'}`);
    out.line(`  provider links/mirrors repaired: ${links}`);
  }
  return problems;
}

/** `agileflow check`: is everything AgileFlow manages present, valid, and visible to providers? */
export async function runCheck(cli: Cli, options: CheckOptions): Promise<number> {
  const { ctx, out } = cli;
  const scopes: ScopeTarget[] = [];
  if (!options.global) {
    const root = await findProject(ctx);
    if (root) scopes.push(projectScope(root));
  }
  const personal = globalScope(ctx);
  if (options.global || (await pathExists(personal.configPath))) scopes.push(personal);
  if (!scopes.length) {
    out.error(`No agileflow.yaml found in ${ctx.cwd} or its parents, and no personal configuration`, [
      'Run `agileflow init` to set up this project.',
    ]);
    const legacy = await planMigration(ctx.cwd, ctx.homeDir);
    if (legacy.detected) out.line('AgileFlow v4 files detected here. Run `agileflow migrate v4 --preview`.');
    return EXIT.ERROR;
  }

  const reports: CheckReport[] = [];
  for (const scope of scopes) {
    const services = await servicesFor(ctx, scope);
    const run = () => checkScope(services, scope, { fix: options.fix, verbose: options.verbose });
    const report = options.fix ? await mutate(cli, scope, run) : await run();
    if (scope.kind === 'global' && (await pathExists(path.join(ctx.homeDir, 'agileflow.yaml')))) {
      report.sections[0]!.diagnostics.push({
        level: 'warn',
        message: '~/agileflow.yaml is ignored: your home directory is not treated as a project',
        detail: ['It would capture every repository below it. Use `agileflow add --global` for personal skills and delete ~/agileflow.yaml and ~/agileflow.lock.'],
      });
    }
    const registry = (services.fetcher as { registry?: { base: string } }).registry?.base;
    if (registry) {
      report.sections[0]!.diagnostics.push({ level: 'info', message: `registry: ${registry}`, verboseOnly: true });
      const fromRepo = scope.kind === 'project' && !ctx.env.AGILEFLOW_REGISTRY && (await readProjectConfig(scope.configPath).catch(() => null))?.registry;
      if (fromRepo) {
        // A cloned repository chooses where its skills come from; say so.
        report.sections[0]!.diagnostics.push({
          level: 'info',
          message: `skills in this project come from ${registry} (registry: in agileflow.yaml)`,
          detail: ['Official @agileflow packages are still verified against the integrities pinned in your CLI.'],
        });
      }
    }
    if (scope.kind === 'project') {
      const legacy = await planMigration(scope.root, ctx.homeDir);
      if (legacy.detected) {
        report.sections[0]!.diagnostics.push({
          level: 'warn',
          message: 'AgileFlow v4 files detected',
          detail: [...legacy.findings.slice(0, 6), 'Run `agileflow migrate v4 --preview` to review a safe cleanup.'],
        });
      }
    }
    if (scope.kind === 'project') {
      const work = await workCheckSection(scope);
      if (work) {
        report.sections.push(work);
        if (work.diagnostics.some((d) => d.level === 'error')) report.healthy = false;
      }
    }
    reports.push(report);
  }

  if (options.json) {
    out.json(
      reports.map((r) => ({
        scope: r.scope.kind,
        root: r.scope.root,
        healthy: r.healthy,
        sections: r.sections,
        fixed: r.fixed ? syncReportJson(r.fixed) : null,
      })),
    );
    return reports.every((r) => r.healthy) ? EXIT.OK : EXIT.ERROR;
  }

  let problems = 0;
  reports.forEach((report, i) => {
    if (i > 0) out.line();
    const title = reports.length > 1 ? (report.scope.kind === 'project' ? 'Project' : 'Personal') : null;
    problems += printReport(cli, report, !!options.verbose, title);
  });
  const warnings = reports.flatMap((r) => r.sections.flatMap((s) => s.diagnostics)).filter((d) => d.level === 'warn').length;
  const withWarnings = warnings ? ` with ${warnings} warning${warnings === 1 ? '' : 's'}` : '';
  out.line(problems ? `Result: ${problems} problem${problems === 1 ? '' : 's'} found` : `Result: healthy${withWarnings}`);
  return problems ? EXIT.ERROR : EXIT.OK;
}
