import path from 'node:path';
import {
  applyMigration,
  editScopeConfig,
  findGitRoot,
  findProjectRoot,
  formatDocsReport,
  loadWorkspace,
  pathExists,
  planMigration,
  projectScope,
  type MigrationAction,
  type MigrationPlan,
} from '@agileflow/core';
import type { Cli } from '../runtime';
import { EXIT, requireProjectScope, servicesFor, splitList, UsageError } from '../runtime';
import { CORE_SKILLS } from './init';
import { runDetach } from './remove';
import { installRequests } from './shared';

export interface MigrateOptions {
  preview?: boolean;
  reportDocs?: boolean;
  yes?: boolean;
  backup?: boolean;
  detach?: boolean;
  keepSkills?: boolean;
  skills?: string;
}

function summarizeActions(plan: MigrationPlan): string[] {
  const lines: string[] = [];
  const runtimeDir = path.join(plan.root, '.agileflow') + path.sep;
  const runtime = plan.actions.filter((a) => a.kind === 'remove' && a.path.startsWith(runtimeDir));
  const others = plan.actions.filter((a) => !runtime.includes(a));
  if (runtime.length) {
    lines.push(`  remove ${runtime.length} AgileFlow-generated file${runtime.length === 1 ? '' : 's'} from .agileflow/ (proven unchanged via v4's file index)`);
  }
  for (const a of others) lines.push(`  ${a.description}`);
  return lines;
}

function describeFailure(a: MigrationAction): string {
  return a.kind === 'remove' ? a.path : a.file;
}

export async function runMigrate(cli: Cli, target: string | undefined, options: MigrateOptions): Promise<number> {
  const { ctx, out, prompter } = cli;
  if (target && target !== 'v4') throw new UsageError(`Unknown migration "${target}". Supported: v4`);

  if (options.detach) {
    const scope = await requireProjectScope(ctx);
    return runDetach(cli, await servicesFor(ctx, scope), scope, { keepSkills: options.keepSkills, yes: options.yes });
  }

  const root = (await findProjectRoot(ctx.cwd)) ?? (await findGitRoot(ctx.cwd)) ?? path.resolve(ctx.cwd);
  const plan = await planMigration(root, ctx.homeDir, { includeHome: true });

  if (options.reportDocs) {
    out.lines(formatDocsReport(plan));
    return EXIT.OK;
  }
  if (!plan.detected) {
    out.line('No AgileFlow v4 files found. Nothing to migrate.');
    if (!(await pathExists(path.join(root, 'agileflow.yaml')))) out.line('Run `agileflow init` to set up AgileFlow v5.');
    return EXIT.OK;
  }

  out.heading('AgileFlow v4 detected:');
  out.lines(plan.findings.map((f) => `  ${f}`));
  out.line();
  if (plan.actions.length) {
    out.heading('Planned changes (only AgileFlow-owned content):');
    out.lines(summarizeActions(plan));
    out.line();
  }
  for (const note of plan.notes) {
    if (note.level === 'warn') out.warn(note.message);
    else out.line(note.message);
    for (const d of note.detail ?? []) out.line(`  ${d}`);
  }
  if (plan.notes.length) out.line();
  if (plan.suggestedSkills.length) {
    out.line(`v5 skills that cover what you used: ${plan.suggestedSkills.join(', ')}`);
    out.line();
  }

  if (options.preview) {
    out.line('Preview only; nothing was changed. Run `agileflow migrate v4` to apply.');
    return EXIT.OK;
  }
  if (!prompter.interactive && !options.yes) {
    out.error('Refusing to change files without confirmation', ['Re-run with --yes to apply, or --preview to only report.']);
    return EXIT.ERROR;
  }
  if (prompter.interactive && !options.yes && !(await prompter.confirm('Apply these changes?', true))) {
    out.line('No changes made.');
    return EXIT.OK;
  }
  let backup = options.backup ?? true;
  if (options.backup === undefined && prompter.interactive && !options.yes && plan.actions.length) {
    backup = await prompter.confirm('Back up everything that changes to .agileflow-v4-backup-<timestamp>/?', true);
  }

  const result = await applyMigration(plan, { backup });
  out.line(`Applied ${result.applied.length} change${result.applied.length === 1 ? '' : 's'}.`);
  if (result.backupDir) out.line(`Backup: ${path.relative(ctx.cwd, result.backupDir) || result.backupDir}`);
  for (const f of result.failed) out.warn(`could not update ${describeFailure(f.action)}: ${f.error}`);
  if (plan.docs.length) out.line('Legacy docs directories were left unchanged (`agileflow migrate v4 --report-docs`).');

  // Set up v5 unless the project already has it.
  const scope = projectScope(root);
  if (!plan.hasV5Config) {
    const services = await servicesFor(ctx, scope);
    const defaults = [...new Set([...CORE_SKILLS.slice(0, 3), ...plan.suggestedSkills])];
    let skills: string[];
    if (options.skills !== undefined) skills = splitList(options.skills);
    else if (prompter.interactive && !options.yes) {
      const catalog = await services.fetcher.listSkills();
      skills = await prompter.multiselect(
        'Install AgileFlow v5 skills?',
        catalog.map((s) => {
          const id = s.name.split('/')[1]!;
          return { value: id, label: id, hint: plan.suggestedSkills.includes(id) ? 'covers what you used in v4' : undefined };
        }),
        defaults.filter((id) => catalog.some((s) => s.name === `@agileflow/${id}`)),
      );
    } else skills = defaults;
    await editScopeConfig(scope, () => undefined);
    const ws = await loadWorkspace(scope);
    if (skills.length) {
      out.line();
      await installRequests(
        cli,
        services,
        ws,
        skills.map((id) => ({ id, spec: { source: `@agileflow/${id}` } })),
        { yes: true, quiet: true },
      );
    }
    out.line('Wrote agileflow.yaml and agileflow.lock.');
  }
  out.line();
  out.line('Migration complete. AgileFlow no longer runs hooks; restart open agent sessions to drop the old ones.');
  return result.failed.length ? EXIT.ERROR : EXIT.OK;
}
