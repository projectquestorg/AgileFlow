import { detachWorkspace, loadWorkspace, removeSkills, type ScopeTarget, type Services } from '@agileflow/core';
import type { Cli } from '../runtime';
import { EXIT, relSkillsDir, scopeFor, servicesFor, UsageError } from '../runtime';

export interface RemoveOptions {
  global?: boolean;
  force?: boolean;
  all?: boolean;
  keepSkills?: boolean;
  yes?: boolean;
}

export async function runRemove(cli: Cli, ids: string[], options: RemoveOptions): Promise<number> {
  const scope = await scopeFor(cli.ctx, options);
  const services = await servicesFor(cli.ctx, scope);
  if (options.all) return runDetach(cli, services, scope, options);
  if (!ids.length) throw new UsageError('Name the skills to remove, or use --all to stop using AgileFlow here');
  const ws = await loadWorkspace(scope);
  const report = await removeSkills(services, ws, ids, { force: options.force });
  for (const id of report.removed) {
    if (report.keptLocal.includes(id)) {
      cli.out.line(`Removed ${id} from AgileFlow; its files in ${relSkillsDir(scope)}/${id} are yours and were kept.`);
    } else {
      cli.out.line(`Removed ${id} (${relSkillsDir(scope)}/${id} and its provider links)`);
    }
  }
  for (const r of report.artifacts) {
    if (r.change.kind === 'warn') cli.out.warn(r.change.message);
    else if (r.outcome === 'failed') cli.out.warn(`could not remove ${r.change.path}: ${r.message}`);
  }
  return EXIT.OK;
}

/** `remove --all` / `migrate --detach`: stop using AgileFlow without breaking skills. */
export async function runDetach(
  cli: Cli,
  services: Services,
  scope: ScopeTarget,
  options: { keepSkills?: boolean; yes?: boolean },
): Promise<number> {
  const ws = await loadWorkspace(scope);
  if (!ws.configExists && !ws.lockExists) {
    cli.out.line('AgileFlow is not set up here; nothing to remove.');
    return EXIT.OK;
  }
  let keepSkills = options.keepSkills ?? true;
  if (options.keepSkills === undefined && cli.prompter.interactive && !options.yes) {
    keepSkills =
      (await cli.prompter.select(
        'Keep installed skills as standalone Agent Skills?',
        [
          { value: 'yes', label: 'Yes', hint: 'skills keep working without AgileFlow' },
          { value: 'no', label: 'No', hint: 'delete unmodified AgileFlow skills' },
        ],
        'yes',
      )) === 'yes';
  }
  const report = await detachWorkspace(services, ws, { keepSkills });
  if (keepSkills) {
    cli.out.line(`Kept ${report.keptSkills.length} skill(s) in ${relSkillsDir(scope)} as standalone Agent Skills.`);
    if (report.keptSkills.length) cli.out.line('Provider links were kept so every provider still sees them.');
  } else {
    if (report.removedSkills.length) cli.out.line(`Deleted: ${report.removedSkills.join(', ')}`);
    if (report.keptModified.length) cli.out.line(`Kept (modified or locally owned): ${report.keptModified.join(', ')}`);
  }
  for (const f of report.removedFiles) cli.out.line(`Removed ${f}`);
  cli.out.line('AgileFlow no longer manages this scope. Nothing depends on the AgileFlow CLI.');
  return EXIT.OK;
}
