import fs from 'node:fs';
import path from 'node:path';
import {
  applyMigration,
  editScopeConfig,
  findGitRoot,
  findProjectRoot,
  formatDocsReport,
  globalScope,
  loadWorkspace,
  migrationErrors,
  pathExists,
  planDetach,
  planMigration,
  prepareAdd,
  projectScope,
  saveLock,
  syncWorkspace,
  type AddRequest,
  type MigrationAction,
  type MigrationConsent,
  type MigrationPlan,
  type MigrationResult,
  type ScopeTarget,
  type Services,
  type Workspace,
} from '@agileflow/core';
import type { Cli } from '../runtime';
import { EXIT, relSkillsDir, requireProjectScope, servicesFor, splitList, UsageError } from '../runtime';
import { CORE_SKILLS } from './init';
import { runDetach } from './remove';
import { mutate } from '../runtime';
import { installRequests, printSyncReport } from './shared';

export interface MigrateOptions {
  preview?: boolean;
  reportDocs?: boolean;
  yes?: boolean;
  backup?: boolean;
  detach?: boolean;
  keepSkills?: boolean;
  deleteSkills?: boolean;
  skills?: string;
  /** Migrate the personal (user-level) v4 install in the home directory. */
  global?: boolean;
  /** Alias of `global`. */
  user?: boolean;
  /** Also remove v4 skill mirrors that cannot be verified against v4's file index. */
  includeUnverified?: boolean;
}

function summarizeActions(plan: MigrationPlan, actions: MigrationAction[]): string[] {
  const lines: string[] = [];
  const runtimeDir = plan.runtimeDir + path.sep;
  const runtime = actions.filter((a) => a.kind === 'remove' && a.path.startsWith(runtimeDir));
  const others = actions.filter((a) => !runtime.includes(a));
  if (runtime.length) {
    lines.push(
      `  remove ${runtime.length} AgileFlow-generated file${runtime.length === 1 ? '' : 's'} from ${plan.label}.agileflow/ (proven unchanged via v4's file index)`,
    );
  }
  const seen = new Set<string>();
  for (const a of others) {
    const text = a.group ?? a.description;
    if (seen.has(text)) continue;
    seen.add(text);
    lines.push(`  ${text}`);
  }
  return lines;
}

const CONSENT_HEADINGS: Record<MigrationConsent, string> = {
  'codex-permissions': 'Codex security settings (asks separately; applied with --yes):',
  'unverified-mirrors': 'Unverified v4 skill mirrors (removed only when you confirm or pass --include-unverified):',
};

function printPlan(cli: Cli, plan: MigrationPlan, heading: string): void {
  const { out } = cli;
  out.heading(heading);
  out.lines(plan.findings.map((f) => `  ${f}`));
  out.line();
  const automatic = plan.actions.filter((a) => !a.consent);
  if (automatic.length) {
    out.heading('Planned changes (only AgileFlow-owned content):');
    out.lines(summarizeActions(plan, automatic));
    out.line();
  }
  for (const consent of Object.keys(CONSENT_HEADINGS) as MigrationConsent[]) {
    const gated = plan.actions.filter((a) => a.consent === consent);
    if (!gated.length) continue;
    out.heading(CONSENT_HEADINGS[consent]);
    out.lines(summarizeActions(plan, gated));
    out.line();
  }
  printNotes(cli, plan);
  if (plan.suggestedSkills.length && plan.location === 'project') {
    out.line(`v5 skills that cover what you used: ${plan.suggestedSkills.join(', ')}`);
    out.line();
  }
}

function printNotes(cli: Cli, plan: MigrationPlan, levels: Array<'info' | 'warn' | 'error'> = ['info', 'warn', 'error']): void {
  const { out } = cli;
  // Errors and warnings (such as the Codex security warning) come first.
  const rank = { error: 0, warn: 1, info: 2 } as const;
  const notes = plan.notes.filter((n) => levels.includes(n.level)).sort((a, b) => rank[a.level] - rank[b.level]);
  for (const note of notes) {
    if (note.level === 'error') {
      out.error(note.message, note.detail ?? []);
      continue;
    }
    if (note.level === 'warn') out.warn(note.message);
    else out.line(note.message);
    for (const d of note.detail ?? []) out.line(`  ${d}`);
    if (note.level === 'warn') out.line();
  }
  if (notes.length && notes[notes.length - 1]!.level !== 'warn') out.line();
}

/** Home-directory v4 leftovers worth telling a project migration about (not just docs). */
function userPlanActionable(plan: MigrationPlan): boolean {
  return plan.actions.length > 0 || plan.notes.some((n) => n.level !== 'info');
}

function userHooksRemain(plan: MigrationPlan | null): boolean {
  if (!plan) return false;
  return (
    plan.actions.some((a) => a.kind === 'edit-settings' || (a.kind === 'edit-codex' && a.removedHooks > 0)) ||
    migrationErrors(plan).length > 0
  );
}

function printUserHint(cli: Cli, userPlan: MigrationPlan): void {
  if (!userPlan.detected || !userPlanActionable(userPlan)) return;
  const { out } = cli;
  out.heading('AgileFlow v4 is also installed in your home directory (affects every project):');
  out.lines(userPlan.findings.map((f) => `  ${f}`));
  out.line('  Review with `agileflow migrate v4 --global --preview`; clean up with `agileflow migrate v4 --global`.');
  out.line();
  printNotes(cli, userPlan, ['warn', 'error']);
}

async function samePath(a: string, b: string): Promise<boolean> {
  const real = async (p: string) => fs.promises.realpath(p).catch(() => path.resolve(p));
  return (await real(a)) === (await real(b));
}

/** Ask for (or take from flags) consent for the gated parts of a plan. */
async function decideConsents(cli: Cli, plan: MigrationPlan, options: MigrateOptions): Promise<MigrationConsent[]> {
  const { prompter } = cli;
  const ask = prompter.interactive && !options.yes;
  const consents: MigrationConsent[] = [];
  const count = (c: MigrationConsent) => plan.actions.filter((a) => a.consent === c).length;
  if (count('codex-permissions')) {
    if (!ask || (await prompter.confirm('Remove the no-approval / full-access Codex settings AgileFlow v4 wrote?', true))) {
      consents.push('codex-permissions');
    }
  }
  const unverified = count('unverified-mirrors');
  if (unverified) {
    if (options.includeUnverified) consents.push('unverified-mirrors');
    else if (ask && (await prompter.confirm(`Also remove ${unverified} unverified v4 skill mirror path(s)? They are backed up first.`, false))) {
      consents.push('unverified-mirrors');
    }
  }
  return consents;
}

async function confirmApply(cli: Cli, options: MigrateOptions, what: string): Promise<boolean | null> {
  const { out, prompter } = cli;
  if (!prompter.interactive && !options.yes) {
    out.error('Refusing to change files without confirmation', ['Re-run with --yes to apply, or --preview to only report.']);
    return null;
  }
  if (prompter.interactive && !options.yes && !(await prompter.confirm(what, true))) {
    out.line('No changes made.');
    return false;
  }
  return true;
}

async function decideBackup(cli: Cli, plan: MigrationPlan, options: MigrateOptions): Promise<boolean> {
  if (options.backup !== undefined) return options.backup;
  if (cli.prompter.interactive && !options.yes && plan.actions.length) {
    const where = plan.location === 'user' ? '~/.agileflow-v4-backup-<timestamp>/' : '.agileflow-v4-backup-<timestamp>/';
    return cli.prompter.confirm(`Back up everything that changes to ${where}?`, true);
  }
  return true;
}

function reportResult(cli: Cli, result: MigrationResult): void {
  const { ctx, out } = cli;
  out.line(`Applied ${result.applied.length} change${result.applied.length === 1 ? '' : 's'}.`);
  if (result.backupDir) out.line(`Backup: ${path.relative(ctx.cwd, result.backupDir) || result.backupDir}`);
  for (const f of result.failed) {
    out.warn(`could not update ${f.action.kind === 'remove' ? f.action.path : f.action.file}: ${f.error}`);
  }
  if (result.skipped.length) {
    out.line(`Left in place (not confirmed): ${result.skipped.length} change${result.skipped.length === 1 ? '' : 's'} (see --preview).`);
  }
}

function printIncomplete(cli: Cli, plan: MigrationPlan, result: MigrationResult | null): number {
  const errors = migrationErrors(plan);
  const failed = result?.failed ?? [];
  if (!errors.length && !failed.length) return EXIT.OK;
  const where = plan.location === 'user' ? ' --global' : '';
  cli.out.error('Migration incomplete: some AgileFlow v4 files or hooks could not be changed', [
    ...errors.map((e) => e.message),
    ...failed.map((f) => `${f.action.description}: ${f.error}`),
    `Fix these by hand (see above), then re-run \`agileflow migrate v4${where}\`.`,
  ]);
  return EXIT.ERROR;
}

interface Bootstrap {
  scope: ScopeTarget;
  services: Services;
  requests: AddRequest[];
  configExists: boolean;
}

/**
 * Decide and resolve the v5 setup BEFORE anything is changed, so a typo in
 * `--skills` or an unreachable registry never leaves a half-migrated project.
 * Runs when the project has no agileflow.yaml, has one without a lock (an
 * earlier run failed while installing), or `--skills` was given.
 */
async function prepareBootstrap(cli: Cli, root: string, plan: MigrationPlan, options: MigrateOptions): Promise<Bootstrap | null> {
  const { prompter } = cli;
  const scope = projectScope(root);
  const ws = await loadWorkspace(scope);
  if (ws.configExists && ws.lockExists && options.skills === undefined) return null;
  const services = await servicesFor(cli.ctx, scope);
  let ids: string[];
  if (options.skills !== undefined) ids = splitList(options.skills);
  else if (ws.configExists) ids = [];
  else {
    const defaults = [...new Set([...CORE_SKILLS.slice(0, 3), ...plan.suggestedSkills])];
    if (prompter.interactive && !options.yes) {
      const catalog = await services.fetcher.listSkills();
      ids = await prompter.multiselect(
        'Install AgileFlow v5 skills?',
        catalog.map((s) => {
          const id = s.name.split('/')[1]!;
          return { value: id, label: id, hint: plan.suggestedSkills.includes(id) ? 'covers what you used in v4' : undefined };
        }),
        defaults.filter((id) => catalog.some((s) => s.name === `@agileflow/${id}`)),
      );
    } else ids = defaults;
  }
  const requests = [...new Set(ids)]
    .filter((id) => !ws.specs[id])
    .map((id) => ({ id, spec: { source: `@agileflow/${id}` } }));
  if (requests.length) await prepareAdd(services, ws, requests);
  return { scope, services, requests, configExists: ws.configExists };
}

async function finishBootstrap(cli: Cli, boot: Bootstrap): Promise<void> {
  if (!boot.configExists) await editScopeConfig(boot.scope, () => undefined);
  const ws: Workspace = await loadWorkspace(boot.scope);
  cli.out.line();
  if (boot.requests.length) {
    await installRequests(cli, boot.services, ws, boot.requests, { yes: true, quiet: true });
  } else if (!ws.lockExists) {
    await saveLock(ws);
    printSyncReport(cli, ws, await syncWorkspace(boot.services, ws));
  }
  cli.out.line(`${boot.configExists ? 'Updated' : 'Wrote'} agileflow.yaml and agileflow.lock.`);
}

export async function runMigrate(cli: Cli, target: string | undefined, options: MigrateOptions): Promise<number> {
  const { ctx, out } = cli;
  if (target && target !== 'v4') throw new UsageError(`Unknown migration "${target}". Supported: v4`);
  if (options.keepSkills && options.deleteSkills) throw new UsageError('Use either --keep-skills or --delete-skills, not both');
  if (options.detach) return runMigrateDetach(cli, options);
  if (options.keepSkills !== undefined || options.deleteSkills) {
    throw new UsageError('--keep-skills and --delete-skills only apply with --detach');
  }

  const personal = !!(options.global || options.user);
  const root = personal ? null : (await findProjectRoot(ctx.cwd, { homeDir: ctx.homeDir })) ?? (await findGitRoot(ctx.cwd)) ?? path.resolve(ctx.cwd);
  if (root === null || (await samePath(root, ctx.homeDir))) {
    if (!personal) out.line('Your home directory is not a project; checking the personal (user-level) v4 install.');
    return runUserMigration(cli, options);
  }

  const plan = await planMigration(root, ctx.homeDir);
  const userPlan = await planMigration(ctx.homeDir, ctx.homeDir, { location: 'user', env: ctx.env });

  if (options.reportDocs) {
    out.lines(formatDocsReport(plan));
    if (userPlan.docs.length) out.lines(formatDocsReport(userPlan));
    return EXIT.OK;
  }

  const ws = await loadWorkspace(projectScope(root));
  const setupPending = ws.configExists && !ws.lockExists;
  if (!plan.detected) {
    out.line('No AgileFlow v4 files found in this project. Nothing to migrate.');
    out.line();
    printUserHint(cli, userPlan);
    if (options.skills !== undefined) out.warn('--skills was ignored; use `agileflow init --skills <ids>` or `agileflow add <ids>`.');
    if (!ws.configExists) out.line('Run `agileflow init` to set up AgileFlow v5.');
    return EXIT.OK;
  }

  printPlan(cli, plan, 'AgileFlow v4 detected:');
  printUserHint(cli, userPlan);

  if (options.preview) {
    out.line('Preview only; nothing was changed. Run `agileflow migrate v4` to apply.');
    return EXIT.OK;
  }

  const nothingToDo = !plan.actions.length && ws.configExists && !setupPending && options.skills === undefined;
  if (nothingToDo) {
    out.line('Nothing left to migrate automatically; remaining v4 items need manual review (see above).');
    return printIncomplete(cli, plan, null);
  }

  const ok = await confirmApply(cli, options, 'Apply these changes?');
  if (ok === null) return EXIT.ERROR;
  if (!ok) return EXIT.OK;
  const consent = await decideConsents(cli, plan, options);
  const backup = await decideBackup(cli, plan, options);

  // Resolve v5 skills before touching anything (throws with nothing changed).
  const boot = await prepareBootstrap(cli, root, plan, options);

  const result = await mutate(cli, projectScope(root), async () => {
    const applied = await applyMigration(plan, { backup, consent });
    reportResult(cli, applied);
    if (plan.docs.length) out.line('Legacy docs directories were left unchanged (`agileflow migrate v4 --report-docs`).');
    if (boot) await finishBootstrap(cli, boot);
    return applied;
  });

  out.line();
  const code = printIncomplete(cli, plan, result);
  if (code !== EXIT.OK) return code;
  if (userHooksRemain(userPlan)) {
    out.line('Project migration complete.');
    out.warn('AgileFlow v4 hooks in your home directory still run in every project. Run `agileflow migrate v4 --global` to remove them.');
  } else {
    out.line('Migration complete. AgileFlow no longer runs hooks; restart open agent sessions to drop the old ones.');
  }
  return EXIT.OK;
}

/** `migrate v4 --global`: the user-level v4 install (`~/.agileflow`, `~/.claude`, `~/.codex`, ...). */
async function runUserMigration(cli: Cli, options: MigrateOptions): Promise<number> {
  const { ctx, out } = cli;
  if (options.skills !== undefined) {
    throw new UsageError('--skills sets up a project; for personal skills run `agileflow init --global --skills <ids>`');
  }
  const plan = await planMigration(ctx.homeDir, ctx.homeDir, { location: 'user', env: ctx.env });
  if (options.reportDocs) {
    out.lines(formatDocsReport(plan));
    return EXIT.OK;
  }
  if (!plan.detected) {
    out.line('No AgileFlow v4 files found in your home directory. Nothing to migrate.');
    return EXIT.OK;
  }
  printPlan(cli, plan, 'AgileFlow v4 detected in your home directory (personal install):');
  if (options.preview) {
    out.line('Preview only; nothing was changed. Run `agileflow migrate v4 --global` to apply.');
    return EXIT.OK;
  }
  if (!plan.actions.length) {
    out.line('Nothing left to migrate automatically; remaining v4 items need manual review (see above).');
    return printIncomplete(cli, plan, null);
  }
  const ok = await confirmApply(cli, options, 'Apply these changes to your home directory?');
  if (ok === null) return EXIT.ERROR;
  if (!ok) return EXIT.OK;
  const consent = await decideConsents(cli, plan, options);
  const backup = await decideBackup(cli, plan, options);
  const result = await applyMigration(plan, { backup, consent });
  reportResult(cli, result);
  if (plan.docs.length) out.line('Legacy docs directories were left unchanged (`agileflow migrate v4 --global --report-docs`).');
  out.line();
  const code = printIncomplete(cli, plan, result);
  if (code !== EXIT.OK) return code;
  out.line('Migration complete. AgileFlow no longer runs hooks; restart open agent sessions to drop the old ones.');
  if (!(await pathExists(globalScope(ctx).configPath))) {
    out.line('Personal v5 skills: `agileflow init --global`.');
  }
  return EXIT.OK;
}

/** `migrate --detach`: show what goes away, confirm (or require --yes), then detach. */
async function runMigrateDetach(cli: Cli, options: MigrateOptions): Promise<number> {
  const { ctx, out, prompter } = cli;
  const scope = await requireProjectScope(ctx);
  const services = await servicesFor(ctx, scope);
  const ws = await loadWorkspace(scope);
  if (!ws.configExists && !ws.lockExists) return runDetach(cli, services, scope, { yes: true });

  let keepSkills = options.deleteSkills ? false : options.keepSkills ?? true;
  if (options.keepSkills === undefined && !options.deleteSkills && prompter.interactive && !options.yes) {
    keepSkills =
      (await prompter.select(
        'Keep installed skills as standalone Agent Skills?',
        [
          { value: 'yes', label: 'Yes', hint: 'skills keep working without AgileFlow' },
          { value: 'no', label: 'No', hint: 'delete unmodified AgileFlow skills' },
        ],
        'yes',
      )) === 'yes';
  }
  const plan = await planDetach(ws, { keepSkills });
  const dir = relSkillsDir(scope);
  out.heading('Stop using AgileFlow in this project:');
  for (const f of plan.files) out.line(`  remove ${path.relative(ctx.cwd, f) || f}`);
  if (keepSkills) {
    if (plan.kept.length) out.line(`  keep ${plan.kept.length} skill(s) in ${dir} as standalone Agent Skills: ${plan.kept.join(', ')}`);
  } else {
    if (plan.remove.length) out.line(`  DELETE ${plan.remove.length} unmodified skill(s) from ${dir}: ${plan.remove.join(', ')}`);
    if (plan.keptModified.length) out.line(`  keep (modified or locally owned): ${plan.keptModified.join(', ')}`);
  }
  out.line();
  if (!prompter.interactive && !options.yes) {
    out.error('Refusing to detach without confirmation', ['Re-run with --yes to apply.']);
    return EXIT.ERROR;
  }
  if (prompter.interactive && !options.yes) {
    const question = !keepSkills && plan.remove.length
      ? `Stop using AgileFlow here and delete ${plan.remove.length} skill(s)?`
      : 'Stop using AgileFlow here?';
    if (!(await prompter.confirm(question, keepSkills))) {
      out.line('No changes made.');
      return EXIT.OK;
    }
  }
  return runDetach(cli, services, scope, { keepSkills, yes: true });
}
